// ==========================================================================
// GLOBAL ERROR HANDLER FOR EASY CLIENT-SIDE DEBUGGING
// ==========================================================================
window.onerror = function(message, source, lineno, colno, error) {
  alert(`스크립트 오류 발생!\n메시지: ${message}\n파일: ${source}\n라인: ${lineno}:${colno}`);
  return false;
};

// ==========================================================================
// APPLICATION STATE
// ==========================================================================
const state = {
  activeStep: 1,
  selectedTopic: '',
  selectedPosition: '', // 'PRO' (찬성) or 'CON' (반대)
  
  argument: {
    mainClaim: '',
    premise1: '',
    premise2: '',
    example: ''
  },
  
  rebuttal: {
    claim: '',
    premise: '',
    alternative: '',
    question: ''
  },
  
  userRebuttal: '',
  
  report: {
    date: '',
    scores: {
      logic: 0,
      evidence: 0,
      persuasion: 0,
      response: 0
    },
    strengths: [],
    weaknesses: [],
    advice: ''
  },

  apiKey: '',
  aiMode: 'mock', 
  customTopics: [],
  history: []
};

const RECOMMENDED_TOPICS = [
  "AI는 인간의 일자리를 대체하는가",
  "주 4일 근무제가 확대되어야 하는가",
  "대학 등록금은 인하되어야 하는가",
  "관광객 제한 정책은 필요한가",
  "온라인 익명성은 보장되어야 하는가"
];

let timerInterval = null;
let timerSecondsLeft = 60;
let timerPreset = 60;
let isTimerRunning = false;

// ==========================================================================
// INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initAppState();
  registerEventListeners();
  updateUI();
});

function initAppState() {
  state.apiKey = localStorage.getItem('debatesim_api_key') || '';
  state.aiMode = localStorage.getItem('debatesim_ai_mode') || 'mock';
  
  try {
    const savedCustom = localStorage.getItem('debatesim_custom_topics');
    if (savedCustom) {
      state.customTopics = JSON.parse(savedCustom);
    }
  } catch (e) {
    console.error("Failed to parse custom topics", e);
    state.customTopics = [];
  }
  
  try {
    const savedHistory = localStorage.getItem('debatesim_history');
    if (savedHistory) {
      state.history = JSON.parse(savedHistory);
    }
  } catch (e) {
    console.error("Failed to parse history", e);
    state.history = [];
  }

  const savedTemp = localStorage.getItem('debatesim_temp_state');
  if (savedTemp) {
    try {
      const parsedTemp = JSON.parse(savedTemp);
      Object.assign(state, parsedTemp);
      restoreInputsFromState();
    } catch (e) {
      console.warn("Failed to load temporary saved state", e);
    }
  }

  document.getElementById('input-api-key').value = state.apiKey;
  document.getElementById('select-ai-mode').value = state.aiMode;
  
  updateStatusIndicators();
  renderTopics();
  renderHistory();
  validateStage1();
  setStep(state.activeStep);
}

function registerEventListeners() {
  document.getElementById('recommended-topics').addEventListener('click', (e) => {
    const item = e.target.closest('.topic-item');
    if (item) {
      selectTopic(item.dataset.topic);
    }
  });

  document.getElementById('btn-add-custom-topic').addEventListener('click', addCustomTopic);
  document.getElementById('input-custom-topic').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addCustomTopic();
  });

  document.getElementById('btn-new-debate').addEventListener('click', resetDebate);

  document.getElementById('btn-select-pro').addEventListener('click', () => selectPosition('PRO'));
  document.getElementById('btn-select-con').addEventListener('click', () => selectPosition('CON'));

  // Step Navigations
  document.getElementById('btn-stage1-next').addEventListener('click', () => {
    if (!state.selectedTopic) {
      alert("토론할 주제를 상단 추천 목록에서 고르거나 왼쪽 하단에서 직접 입력하여 리스트에 추가해 주세요.");
      return;
    }
    if (!state.selectedPosition) {
      alert("이 주제에 대해 '찬성(PRO)' 또는 '반대(CON)' 중 입장을 선택해 주세요.");
      return;
    }
    setStep(2);
  });
  
  document.getElementById('btn-stage2-prev').addEventListener('click', () => setStep(1));
  document.getElementById('btn-request-rebuttal').addEventListener('click', requestRebuttal);

  document.getElementById('btn-stage3-prev').addEventListener('click', () => setStep(2));
  document.getElementById('btn-analyze-debate').addEventListener('click', analyzeDebate);

  document.getElementById('btn-restart').addEventListener('click', resetDebate);

  document.getElementById('btn-settings').addEventListener('click', openSettingsModal);
  document.getElementById('btn-close-modal').addEventListener('click', closeSettingsModal);
  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
  
  document.getElementById('btn-export-txt').addEventListener('click', exportTxt);
  document.getElementById('btn-export-pdf').addEventListener('click', exportPdf);

  document.getElementById('input-main-claim').addEventListener('input', (e) => {
    state.argument.mainClaim = e.target.value;
    document.getElementById('count-main-claim').textContent = `${e.target.value.length} / 200`;
    triggerAutosave();
  });
  document.getElementById('input-premise-1').addEventListener('input', (e) => {
    state.argument.premise1 = e.target.value;
    triggerAutosave();
  });
  document.getElementById('input-premise-2').addEventListener('input', (e) => {
    state.argument.premise2 = e.target.value;
    triggerAutosave();
  });
  document.getElementById('input-example').addEventListener('input', (e) => {
    state.argument.example = e.target.value;
    triggerAutosave();
  });
  document.getElementById('input-user-rebuttal').addEventListener('input', (e) => {
    state.userRebuttal = e.target.value;
    triggerAutosave();
  });

  document.getElementById('search-history').addEventListener('input', renderHistory);

  document.getElementById('btn-timer-start').addEventListener('click', toggleTimer);
  document.getElementById('btn-timer-reset').addEventListener('click', resetTimer);
  
  const presets = document.querySelectorAll('.btn-preset');
  presets.forEach(btn => {
    btn.addEventListener('click', () => {
      if (isTimerRunning) return; 
      presets.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const time = parseInt(btn.dataset.time, 10);
      timerPreset = time;
      timerSecondsLeft = time;
      updateTimerDisplay();
    });
  });
}

// ==========================================================================
// CORE STATE CONTROLLERS
// ==========================================================================
function setStep(stepNum) {
  state.activeStep = stepNum;
  triggerAutosave();

  for (let i = 1; i <= 4; i++) {
    const stageEl = document.getElementById(`stage-${i}`);
    const indEl = document.getElementById(`step-ind-${i}`);
    
    if (i === stepNum) {
      stageEl.classList.add('active');
      indEl.classList.add('active');
      indEl.classList.remove('completed');
    } else {
      stageEl.classList.remove('active');
      indEl.classList.remove('active');
      if (i < stepNum) {
        indEl.classList.add('completed');
      } else {
        indEl.classList.remove('completed');
      }
    }
  }

  const progressPercent = ((stepNum - 1) / 3) * 100;
  document.getElementById('progress-bar-fill').style.width = `${progressPercent}%`;

  renderStepGuide(stepNum);
}

function selectTopic(topicName) {
  state.selectedTopic = topicName;
  
  document.querySelectorAll('.topic-item').forEach(item => {
    if (item.dataset.topic === topicName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  document.getElementById('stage1-selected-topic-title').textContent = topicName;
  validateStage1();
  triggerAutosave();
}

function selectPosition(pos) {
  state.selectedPosition = pos;

  const proBtn = document.getElementById('btn-select-pro');
  const conBtn = document.getElementById('btn-select-con');

  if (pos === 'PRO') {
    proBtn.classList.add('active');
    conBtn.classList.remove('active');
  } else {
    conBtn.classList.add('active');
    proBtn.classList.remove('active');
  }

  const proText = pos === 'PRO' ? '찬성 (PRO)' : '반대 (CON)';
  const badgeClass = pos === 'PRO' ? 'pos-badge pro' : 'pos-badge con';
  
  const step2Badge = document.getElementById('stage2-pos-badge');
  step2Badge.textContent = proText;
  step2Badge.className = badgeClass;
  
  const step3Badge = document.getElementById('stage3-pos-badge');
  step3Badge.textContent = proText;
  step3Badge.className = badgeClass;

  validateStage1();
  triggerAutosave();
}

function addCustomTopic() {
  const input = document.getElementById('input-custom-topic');
  const topic = input.value.trim();
  
  if (!topic) return;

  if (!state.customTopics.includes(topic) && !RECOMMENDED_TOPICS.includes(topic)) {
    state.customTopics.push(topic);
    localStorage.setItem('debatesim_custom_topics', JSON.stringify(state.customTopics));
  }

  renderTopics();
  selectTopic(topic);
  input.value = '';
}

function validateStage1() {
  const btnNext = document.getElementById('btn-stage1-next');
  btnNext.removeAttribute('disabled');

  if (state.selectedTopic) {
    const s2t = document.getElementById('stage2-topic-title');
    const s3t = document.getElementById('stage3-topic-title');
    if (s2t) s2t.textContent = state.selectedTopic;
    if (s3t) s3t.textContent = state.selectedTopic;
  }
}

// ==========================================================================
// RENDERERS
// ==========================================================================
function renderTopics() {
  const list = document.getElementById('recommended-topics');
  list.innerHTML = '';

  const allTopics = [...RECOMMENDED_TOPICS, ...state.customTopics];
  
  allTopics.forEach(topic => {
    const li = document.createElement('li');
    li.className = 'topic-item';
    if (state.selectedTopic === topic) li.classList.add('active');
    li.dataset.topic = topic;
    li.textContent = topic;
    list.appendChild(li);
  });
}

function renderHistory() {
  const list = document.getElementById('history-list');
  const searchVal = document.getElementById('search-history').value.toLowerCase().trim();
  list.innerHTML = '';

  const filtered = state.history.filter(item => {
    return item.topic.toLowerCase().includes(searchVal) || 
           item.position.toLowerCase().includes(searchVal) ||
           item.date.includes(searchVal);
  });

  if (filtered.length === 0) {
    list.innerHTML = '<div class="badge" style="text-align:center; padding: 15px; color: var(--text-muted);">기록이 없습니다.</div>';
    return;
  }

  filtered.sort((a, b) => new Date(b.date + ' ' + (b.time || '00:00:00')) - new Date(a.date + ' ' + (a.time || '00:00:00')));

  filtered.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';
    
    const avgScore = Math.round((item.scores.logic + item.scores.evidence + item.scores.persuasion + item.scores.response) / 4);
    const posBadgeText = item.position === 'PRO' ? '찬성' : '반대';
    const posClass = item.position === 'PRO' ? 'pro-color' : 'con-color';

    div.innerHTML = `
      <div class="hist-header">
        <span>${item.date}</span>
        <span class="${posClass}">${posBadgeText}</span>
      </div>
      <div class="hist-title">${item.topic}</div>
      <div class="hist-footer">
        <span class="hist-score">평균 ${avgScore}점</span>
      </div>
      <button class="btn-del-history" data-id="${item.id}" title="기록 삭제">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    `;

    div.addEventListener('click', (e) => {
      if (e.target.closest('.btn-del-history')) return; 
      loadHistoryItem(item);
    });

    const delBtn = div.querySelector('.btn-del-history');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteHistoryItem(item.id);
    });

    list.appendChild(div);
  });
}

function renderStepGuide(stepNum) {
  const guideList = document.getElementById('stage-guides');
  guideList.innerHTML = '';

  const guides = {
    1: [
      { icon: 'fa-check', text: '자신에게 익숙한 주제를 먼저 골라 토론의 기본기를 익혀보세요.' },
      { icon: 'fa-shuffle', text: '평소 자신의 생각과 다른 입장을 선택해 연습하는 것이 비판적 사고 훈련에 좋습니다.' }
    ],
    2: [
      { icon: 'fa-brain', text: '핵심 주장은 논지를 한눈에 드러내도록 요약 정리하세요.' },
      { icon: 'fa-lightbulb', text: '근거 1과 근거 2는 겹치지 않고 서로 다른 관점을 제시하는 것이 효율적입니다.' },
      { icon: 'fa-book-open', text: '사례 작성 시 명확한 데이터나 보편적인 통계를 가정하면 설득력이 크게 상승합니다.' }
    ],
    3: [
      { icon: 'fa-bullseye', text: 'AI가 반박한 내용을 꼼꼼히 분석하여 아킬레스건을 찾아보세요.' },
      { icon: 'fa-shield-halved', text: '상대의 근거 비판에 대해 무조건적인 부인보다 본질적인 대안의 취약점을 제기해야 합니다.' },
      { icon: 'fa-comment-dots', text: 'AI가 던진 예상 질문에 대해 구체적인 해명을 재반박에 포함해 주세요.' }
    ],
    4: [
      { icon: 'fa-star', text: '최종 점수는 4개의 다차원 평가 매트릭스로 생성됩니다.' },
      { icon: 'fa-file-pdf', text: '우측 하단의 내보내기 도구를 이용해 포트폴리오로 저장하세요.' },
      { icon: 'fa-arrows-rotate', text: '동일 주제에 대해 다른 찬반 입장을 정해 재도전해 보는 것도 좋습니다.' }
    ]
  };

  guides[stepNum].forEach(guide => {
    const li = document.createElement('li');
    li.innerHTML = `<i class="fa-solid ${guide.icon}"></i> ${guide.text}`;
    guideList.appendChild(li);
  });
}

function restoreInputsFromState() {
  if (state.selectedTopic) {
    selectTopic(state.selectedTopic);
  }
  if (state.selectedPosition) {
    selectPosition(state.selectedPosition);
  }

  document.getElementById('input-main-claim').value = state.argument.mainClaim || '';
  document.getElementById('count-main-claim').textContent = `${(state.argument.mainClaim || '').length} / 200`;
  document.getElementById('input-premise-1').value = state.argument.premise1 || '';
  document.getElementById('input-premise-2').value = state.argument.premise2 || '';
  document.getElementById('input-example').value = state.argument.example || '';
  document.getElementById('input-user-rebuttal').value = state.userRebuttal || '';
  
  if (state.rebuttal && state.rebuttal.claim) {
    document.getElementById('ai-rebuttal-claim').textContent = state.rebuttal.claim;
    document.getElementById('ai-rebuttal-premise').textContent = state.rebuttal.premise;
    document.getElementById('ai-rebuttal-alternative').textContent = state.rebuttal.alternative;
    document.getElementById('ai-rebuttal-question').textContent = state.rebuttal.question;
  }
}

function updateUI() {
  document.getElementById('stage2-topic-title').textContent = state.selectedTopic || '';
  document.getElementById('stage3-topic-title').textContent = state.selectedTopic || '';
}

// ==========================================================================
// CONFIGURATIONS
// ==========================================================================
function openSettingsModal() {
  document.getElementById('settings-modal').classList.add('active');
}
function closeSettingsModal() {
  document.getElementById('settings-modal').classList.remove('active');
}
function saveSettings() {
  const key = document.getElementById('input-api-key').value.trim();
  const mode = document.getElementById('select-ai-mode').value;

  state.apiKey = key;
  state.aiMode = mode;

  localStorage.setItem('debatesim_api_key', key);
  localStorage.setItem('debatesim_ai_mode', mode);

  updateStatusIndicators();
  closeSettingsModal();
}

function updateStatusIndicators() {
  const netStatus = document.getElementById('network-status');
  if (state.aiMode === 'gemini') {
    netStatus.className = 'status-badge normal';
    netStatus.innerHTML = '<i class="fa-solid fa-wifi"></i> Gemini AI 모드';
  } else {
    netStatus.className = 'status-badge normal';
    netStatus.innerHTML = '<i class="fa-solid fa-circle-play"></i> 로컬 Mock AI 모드';
  }
}

function triggerAutosave() {
  const statusBadge = document.getElementById('autosave-status');
  if (!statusBadge) return;
  statusBadge.className = 'status-badge normal';
  statusBadge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...';

  const tempState = {
    activeStep: state.activeStep,
    selectedTopic: state.selectedTopic,
    selectedPosition: state.selectedPosition,
    argument: state.argument,
    rebuttal: state.rebuttal,
    userRebuttal: state.userRebuttal
  };
  localStorage.setItem('debatesim_temp_state', JSON.stringify(tempState));

  setTimeout(() => {
    statusBadge.className = 'status-badge success';
    statusBadge.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> 자동 저장됨';
  }, 600);
}

// ==========================================================================
// AI REBUTTALS
// ==========================================================================
async function requestRebuttal() {
  if (!state.argument.mainClaim.trim() || !state.argument.premise1.trim()) {
    alert("핵심 주장과 근거 1은 필수 입력값입니다. 내용을 입력해 주세요.");
    return;
  }

  setStep(3);
  updateUI();

  document.getElementById('summary-main-claim').textContent = state.argument.mainClaim;
  document.getElementById('summary-premise-1').textContent = state.argument.premise1;
  document.getElementById('summary-premise-2').textContent = state.argument.premise2 || '(기재하지 않음)';

  document.getElementById('ai-rebuttal-claim').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 분석 및 주장 비판 구성 중...';
  document.getElementById('ai-rebuttal-premise').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 논리 구조 취약점 공략 중...';
  document.getElementById('ai-rebuttal-alternative').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 대안적 비전 탐색 중...';
  document.getElementById('ai-rebuttal-question').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 공격적 토론 질문 설계 중...';

  resetTimer();
  startTimer();

  try {
    let result;
    if (state.aiMode === 'gemini' && state.apiKey) {
      result = await generateGeminiRebuttal();
    } else {
      result = await generateMockRebuttal();
    }

    state.rebuttal = result;
    triggerAutosave();

    document.getElementById('ai-rebuttal-claim').textContent = result.claim;
    document.getElementById('ai-rebuttal-premise').textContent = result.premise;
    document.getElementById('ai-rebuttal-alternative').textContent = result.alternative;
    document.getElementById('ai-rebuttal-question').textContent = result.question;

  } catch (error) {
    console.error("AI Counter Argument Error:", error);
    alert("AI 반론 생성에 실패하였습니다. 오프라인 모드로 자동 전환합니다.");
    state.aiMode = 'mock';
    updateStatusIndicators();
    
    const result = await generateMockRebuttal();
    state.rebuttal = result;
    triggerAutosave();

    document.getElementById('ai-rebuttal-claim').textContent = result.claim;
    document.getElementById('ai-rebuttal-premise').textContent = result.premise;
    document.getElementById('ai-rebuttal-alternative').textContent = result.alternative;
    document.getElementById('ai-rebuttal-question').textContent = result.question;
  }
}

async function generateGeminiRebuttal() {
  const oppositePosition = state.selectedPosition === 'PRO' ? '반대(CON)' : '찬성(PRO)';
  const userPosition = state.selectedPosition === 'PRO' ? '찬성(PRO)' : '반대(CON)';

  const prompt = `
당신은 대학교 토론 대회의 심사위원이자 숙련된 논객입니다.
아래의 토론 주제와 사용자의 찬/반 입장, 그리고 사용자의 주장을 기반으로 상대방 토론자 입장에서 비판적이고 체계적인 반론을 생성해 주십시오.

[토론 정보]
- 토론 주제: ${state.selectedTopic}
- 사용자의 입장: ${userPosition} (따라서 당신의 입장은 ${oppositePosition} 입니다.)
- 핵심 주장: ${state.argument.mainClaim}
- 근거 1: ${state.argument.premise1}
- 근거 2: ${state.argument.premise2}
- 제시한 예시/사례: ${state.argument.example}

JSON 규격 반환 항목:
1. "claim": 핵심 주장 반박.
2. "premise": 근거 1, 2 비판.
3. "alternative": 대안 제시.
4. "question": 아킬레스건 예상 질문.

출력 포맷: 반드시 { "claim": "", "premise": "", "alternative": "", "question": "" } 의 순수 JSON 텍스트로만 응답하십시오 (Markdown 기호는 빼 주십시오):
`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${state.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    })
  });

  if (!response.ok) throw new Error(`Gemini API HTTP Error ${response.status}`);
  const data = await response.json();
  const text = data.candidates[0].content.parts[0].text;
  return JSON.parse(text.trim());
}

function generateMockRebuttal() {
  return new Promise((resolve) => {
    setTimeout(() => {
      const isPro = state.selectedPosition === 'PRO';
      const topic = state.selectedTopic;
      
      let claimReb = "";
      let premiseReb = "";
      let altReb = "";
      let questReb = "";

      if (topic.includes("일자리")) {
        claimReb = isPro 
          ? "AI가 새로운 일자리를 창출한다는 보장은 없으며, 생산 인력의 퇴출 속도가 재교육 및 신산업 흡수 속도보다 빨라 대량 실업 사태가 필연적입니다."
          : "단순 반복 노동의 대체는 인간을 고부가가치 창의 활동에 전념케 합니다. 인류 역사상 모든 기술 혁신은 궁극적으로 더 양질의 일자리를 창출해 왔습니다.";
        premiseReb = isPro
          ? "생산성 증대 효과만 강조했을 뿐, 실업으로 발생하는 막대한 국가적 사회 보장 비용 및 양극화의 부정적 경제 충격에 대한 근거가 부족합니다."
          : "기술 발전에 대응하지 못해 도태되는 계층의 경제적 생존권에 대한 배려를 '비효율성'이라는 이름으로 너무 가볍게 외면하고 있습니다.";
        altReb = isPro
          ? "AI 도입 속도를 규제하고 '로봇세'를 도입해 실직자 재교육 기금을 조성하거나 사회안전망을 선제적으로 구축하는 대안 정책이 필요합니다."
          : "전면적 규제보다는 AI 직무 전환 교육 지원 제도를 강화하고, AI 협업 능력을 교과 과정에 필수 도입하여 시장 적응력을 높여야 합니다.";
        questReb = isPro
          ? "로봇세나 인위적 기술 규제가 오히려 자국 기업의 글로벌 기술 경쟁력을 후퇴시켜 장기적으로 일자리를 소멸시키는 결과를 낳지 않을까요?"
          : "AI의 고도화로 단순직을 넘어 전문직 지식 노동까지 급속 대체될 때, 과연 일반 노동자가 그만한 창의적 업종으로 단기간에 전환될 수 있다고 보십니까?";
      } 
      else if (topic.includes("주 4일")) {
        claimReb = isPro
          ? "업무 시간 감소는 실질 생산량 저하로 이어집니다. 노동 유연성이 낮은 한국 시장 구조에서 급격한 노동 단축은 한계 기업의 도산을 촉진할 것입니다."
          : "주 4일제로 인한 근로자 휴식과 리프레시는 창의적 업무 집중도를 유발합니다. 긴 노동시간이 생산성과 정비례한다는 것은 구시대적 발상입니다.";
        premiseReb = isPro
          ? "삶의 질 향상이 생산성으로 직결된다는 논리는 제조업 등 교대 근무나 기계 가동률에 직접 지배받는 직종의 현실을 고려하지 않은 편향적 관점입니다."
          : "단순히 기업의 단기적 실적 저하나 중소기업의 구인난만을 지나치게 우려하여 근로자 삶의 질 향상이 가져올 장기적 내수 소비 진작 효과를 과소평가합니다.";
        altReb = isPro
          ? "획일적 주 4일제 도입보다는 유연근무제 확대, 연차 사용의 완전 자유화 등 자율적 업무 조정 체계를 기업이 자체 수립하는 대안이 타당합니다."
          : "점진적 법정 노동 시간 단축 로드맵을 구축하고, 주 4일제를 시범 도입하는 강소기업에 세제 혜택과 인건비 보전을 매칭하는 패키지 지원이 적합합니다.";
        questReb = isPro
          ? "생산성 유지를 위해 노동 강도가 집중되어 근로자가 주 4일 동안 더 극심한 스트레스와 야근 압박에 시달린다면 삶의 질이 향상되었다고 볼 수 있을까요?"
          : "주 5일 분량의 실무를 4일 만에 감당해야 해 기업이 결국 서비스 품질 하락이나 외주 비용 증가를 겪게 된다면, 이에 대한 재정적 대안은 무엇입니까?";
      }
      else {
        claimReb = isPro
          ? `선택하신 주장 '${state.argument.mainClaim.substring(0, 30)}...'은(는) 현실적 실행 과정의 비용을 너무 과소평가하고 있습니다.`
          : `선택하신 반대 논리 '${state.argument.mainClaim.substring(0, 30)}...'은(는) 변화가 가져올 미래 가치와 공익적 혁신을 과도하게 제약하고 있습니다.`;
        premiseReb = isPro
          ? `제시한 첫 번째 근거는 인과관계 입증이 어려우며, 다른 외적 영향을 충분히 통제하지 못한 한계가 있습니다.`
          : `반대 입장의 근거는 특수한 소수의 부정적 우려를 지나치게 보편화하여 전체 선순환 가능성을 차단합니다.`;
        altReb = "단기적 억제보다는 규제 완화와 인센티브 유인 방식의 시장 친화적 정책 모듈 도입이 현명한 대안입니다.";
        questReb = "해당 제도가 실행되었을 때 예상하지 못한 다른 부작용이나 풍선 효과가 야기된다면 어떻게 대처하시겠습니까?";
      }

      resolve({
        claim: claimReb,
        premise: premiseReb,
        alternative: altReb,
        question: questReb
      });
    }, 1200);
  });
}

// ==========================================================================
// REPORTS & ANALYTICS
// ==========================================================================
async function analyzeDebate() {
  if (!state.userRebuttal.trim()) {
    alert("AI 반론에 대한 본인의 재반박을 입력해 주세요. 토론 연습이 완료되지 않았습니다.");
    return;
  }

  setStep(4);
  
  document.getElementById('report-topic').textContent = state.selectedTopic;
  document.getElementById('report-date').textContent = new Date().toLocaleDateString('ko-KR');
  document.getElementById('report-position').textContent = state.selectedPosition === 'PRO' ? '찬성' : '반대';
  document.getElementById('report-position').className = state.selectedPosition === 'PRO' ? 'badge pro-badge' : 'badge con-badge';

  document.getElementById('report-summary-user').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 분석 중...';
  document.getElementById('report-summary-ai').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 분석 중...';
  document.getElementById('report-advice').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 피드백을 산출하는 중...';
  document.getElementById('report-strengths').innerHTML = '<li>분석 중...</li>';
  document.getElementById('report-weaknesses').innerHTML = '<li>분석 중...</li>';

  updateRadialProgress('circle-logic', 'score-text-logic', 0);
  updateRadialProgress('circle-evidence', 'score-text-evidence', 0);
  updateRadialProgress('circle-persuasion', 'score-text-persuasion', 0);
  updateRadialProgress('circle-response', 'score-text-response', 0);

  stopTimer();

  try {
    let reportResult;
    if (state.aiMode === 'gemini' && state.apiKey) {
      reportResult = await generateGeminiAnalysis();
    } else {
      reportResult = await generateMockAnalysis();
    }

    state.report = reportResult;
    triggerAutosave();

    document.getElementById('report-summary-user').textContent = reportResult.userSummary;
    document.getElementById('report-summary-ai').textContent = reportResult.aiSummary;
    document.getElementById('report-advice').textContent = reportResult.advice;

    const strengthsUl = document.getElementById('report-strengths');
    strengthsUl.innerHTML = '';
    reportResult.strengths.forEach(str => {
      const li = document.createElement('li');
      li.textContent = str;
      strengthsUl.appendChild(li);
    });

    const weaknessesUl = document.getElementById('report-weaknesses');
    weaknessesUl.innerHTML = '';
    reportResult.weaknesses.forEach(wk => {
      const li = document.createElement('li');
      li.textContent = wk;
      weaknessesUl.appendChild(li);
    });

    setTimeout(() => {
      updateRadialProgress('circle-logic', 'score-text-logic', reportResult.scores.logic);
      updateRadialProgress('circle-evidence', 'score-text-evidence', reportResult.scores.evidence);
      updateRadialProgress('circle-persuasion', 'score-text-persuasion', reportResult.scores.persuasion);
      updateRadialProgress('circle-response', 'score-text-response', reportResult.scores.response);
    }, 400);

    saveToHistory(reportResult);

  } catch (error) {
    console.error("Report Analysis Error:", error);
    alert("분석 피드백 생성에 실패하였습니다. Mock 분석으로 대체합니다.");
    state.aiMode = 'mock';
    updateStatusIndicators();

    const reportResult = await generateMockAnalysis();
    state.report = reportResult;
    triggerAutosave();

    document.getElementById('report-summary-user').textContent = reportResult.userSummary;
    document.getElementById('report-summary-ai').textContent = reportResult.aiSummary;
    document.getElementById('report-advice').textContent = reportResult.advice;

    const strengthsUl = document.getElementById('report-strengths');
    strengthsUl.innerHTML = '';
    reportResult.strengths.forEach(str => {
      const li = document.createElement('li');
      li.textContent = str;
      strengthsUl.appendChild(li);
    });

    const weaknessesUl = document.getElementById('report-weaknesses');
    weaknessesUl.innerHTML = '';
    reportResult.weaknesses.forEach(wk => {
      const li = document.createElement('li');
      li.textContent = wk;
      weaknessesUl.appendChild(li);
    });

    setTimeout(() => {
      updateRadialProgress('circle-logic', 'score-text-logic', reportResult.scores.logic);
      updateRadialProgress('circle-evidence', 'score-text-evidence', reportResult.scores.evidence);
      updateRadialProgress('circle-persuasion', 'score-text-persuasion', reportResult.scores.persuasion);
      updateRadialProgress('circle-response', 'score-text-response', reportResult.scores.response);
    }, 400);

    saveToHistory(reportResult);
  }
}

async function generateGeminiAnalysis() {
  const userPosition = state.selectedPosition === 'PRO' ? '찬성(PRO)' : '반대(CON)';
  const oppositePosition = state.selectedPosition === 'PRO' ? '반대(CON)' : '찬성(PRO)';

  const prompt = `
당신은 대학교 토론 대회의 수석 심사위원입니다.
아래 제공된 토론 내용을 다각도로 평가하여 공정하고 논리적인 피드백 리포트를 작성해 주십시오.

[토론 데이터]
- 토론 주제: ${state.selectedTopic}
- 사용자의 입장: ${userPosition}
- 사용자의 최초 입론 (주장/근거1/근거2/사례):
  * 주장: ${state.argument.mainClaim}
  * 근거 1: ${state.argument.premise1}
  * 근거 2: ${state.argument.premise2}
  * 사례: ${state.argument.example}
- AI의 반론 (${oppositePosition} 입장): ${state.rebuttal.claim}
- 사용자의 최종 재반박: ${state.userRebuttal}

JSON 형식으로 응답해 주세요:
{
  "scores": { "logic": 85, "evidence": 78, "persuasion": 90, "response": 82 },
  "userSummary": "요약",
  "aiSummary": "요약",
  "strengths": ["강점1", "강점2"],
  "weaknesses": ["약점1", "약점2"],
  "advice": "조언"
}
`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${state.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    })
  });

  if (!response.ok) throw new Error(`Gemini API HTTP Error ${response.status}`);
  const data = await response.json();
  const text = data.candidates[0].content.parts[0].text;
  return JSON.parse(text.trim());
}

function generateMockAnalysis() {
  return new Promise((resolve) => {
    setTimeout(() => {
      const mainClaimLen = state.argument.mainClaim.length;
      const premise1Len = state.argument.premise1.length;
      const premise2Len = state.argument.premise2.length;
      const exampleLen = state.argument.example.length;
      const rebuttalLen = state.userRebuttal.length;

      let scoreLogic = 70 + Math.min(Math.floor(mainClaimLen / 10) + Math.floor(premise1Len / 25), 20);
      let scoreEvidence = 65 + Math.min(Math.floor(exampleLen / 15), 25);
      let scorePersuasion = 70 + Math.min(Math.floor(premise1Len / 20) + Math.floor(premise2Len / 20), 20);
      let scoreResponse = 60 + Math.min(Math.floor(rebuttalLen / 12), 30);

      if (premise2Len < 5) {
        scoreLogic -= 5;
        scorePersuasion -= 5;
      }
      if (exampleLen < 5) {
        scoreEvidence -= 15;
      }

      scoreLogic = Math.max(50, Math.min(scoreLogic, 97));
      scoreEvidence = Math.max(50, Math.min(scoreEvidence, 97));
      scorePersuasion = Math.max(50, Math.min(scorePersuasion, 97));
      scoreResponse = Math.max(50, Math.min(scoreResponse, 97));

      let strengths = [];
      let weaknesses = [];
      let advice = "";

      if (scoreLogic > 85) {
        strengths.push("핵심 주장과 근거 사이의 긴밀한 인과 논리가 유기적으로 정렬되어 있습니다.");
        strengths.push("합리적인 기조의 서술 방식으로 대학교 학술 토론 수준에 적합한 격식을 유지하고 있습니다.");
      } else {
        strengths.push("본인이 주장하고자 하는 논점의 방향성이 명확하게 선언되어 있습니다.");
        weaknesses.push("핵심 주장 대비 각 근거들의 범주가 일부 중복되거나 명확한 인과성 증명이 다소 부족합니다.");
      }

      if (scoreEvidence > 80) {
        strengths.push("논제를 실증할 수 있는 사례 요소를 입론 단계에서 적절히 배치하여 신뢰도를 높였습니다.");
      } else {
        weaknesses.push("주장을 객관적으로 증명할 연구 자료나 공신력 있는 데이터 예시가 불충분하여 아쉬움이 남습니다.");
      }

      if (scoreResponse > 80) {
        strengths.push("상대방 AI가 공세적으로 비판한 논리에 정면으로 직시하여 타당성 있는 반박을 펼치셨습니다.");
      } else {
        weaknesses.push("상대 AI가 제시한 대안의 약점을 공략하기보다 본인 주장의 반복 서술에 머문 경향이 있습니다.");
      }

      if (weaknesses.length === 0) {
        weaknesses.push("토론 전개 속에서 조금 더 통계 자료의 최신성을 보강하십시오.");
      }

      if (scoreResponse < 75) {
        advice = "상대방의 논거를 반박할 때에는 본인이 원래 했던 입론을 그대로 반복하기보다, 상대 논제 속의 '전제 오류'나 '논리 비약'을 포착하여 지적하는 역공 방식이 더 뛰어납니다. AI의 예상 질문에 더 직설적이고 구조화된 정량 데이터로 대응해 보세요.";
      } else {
        advice = "전반적으로 훌륭한 반박을 펼치셨습니다. 다음 단계에서는 상대방의 대안이 초래할 '사회적 부작용'이나 '기회비용'을 수치화된 예상 전망치와 함께 전개해 보세요. 이것이 대학교 학술 Debate에서 심사위원들로부터 가산점을 얻는 핵심 팁입니다.";
      }

      resolve({
        scores: {
          logic: scoreLogic,
          evidence: scoreEvidence,
          persuasion: scorePersuasion,
          response: scoreResponse
        },
        userSummary: `사용자는 '${state.selectedTopic}'에 대해 [핵심 주장]으로 '${state.argument.mainClaim}'을 선언하고, 이를 입증하기 위한 개별 논거로 [근거 1] '${state.argument.premise1.substring(0, 35)}...' 및 구체적인 사실을 연계하여 입론을 체계화하고자 했습니다.`,
        aiSummary: `AI는 상대방의 입장에서, 제안의 과도한 조급성이나 예상치 못한 막대한 부대비용의 수반 가능성을 짚었으며, 규제 중심 대신 인센티브나 완충책 등의 구체적인 대안을 역으로 활용해 상대 논리의 한계를 압박하였습니다.`,
        strengths: strengths,
        weaknesses: weaknesses,
        advice: advice
      });
    }, 1500);
  });
}

function updateRadialProgress(circleId, textId, score) {
  const circle = document.getElementById(circleId);
  const text = document.getElementById(textId);
  if (!circle || !text) return;
  
  const circumference = 213.6;
  const offset = circumference - (score / 100) * circumference;
  
  circle.style.strokeDashoffset = offset;
  text.textContent = score;

  if (score >= 90) {
    circle.style.stroke = 'var(--color-accent)';
  } else if (score >= 80) {
    circle.style.stroke = 'var(--color-primary)';
  } else if (score >= 60) {
    circle.style.stroke = 'var(--color-alt)';
  } else {
    circle.style.stroke = 'var(--color-con)';
  }
}

// ==========================================================================
// HISTORY DATABASE
// ==========================================================================
function saveToHistory(reportResult) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '.').replace(/\.$/, '');
  const timeStr = today.toTimeString().split(' ')[0];

  const historyItem = {
    id: 'hist_' + Date.now(),
    date: dateStr,
    time: timeStr,
    topic: state.selectedTopic,
    position: state.selectedPosition,
    argument: { ...state.argument },
    rebuttal: { ...state.rebuttal },
    userRebuttal: state.userRebuttal,
    scores: { ...reportResult.scores },
    strengths: [...reportResult.strengths],
    weaknesses: [...reportResult.weaknesses],
    advice: reportResult.advice,
    userSummary: reportResult.userSummary,
    aiSummary: reportResult.aiSummary
  };

  state.history.push(historyItem);
  localStorage.setItem('debatesim_history', JSON.stringify(state.history));
  localStorage.removeItem('debatesim_temp_state');
  renderHistory();
}

function loadHistoryItem(item) {
  state.selectedTopic = item.topic;
  state.selectedPosition = item.position;
  state.argument = { ...item.argument };
  state.rebuttal = { ...item.rebuttal };
  state.userRebuttal = item.userRebuttal;
  state.report = {
    date: item.date,
    scores: { ...item.scores },
    strengths: [...item.strengths],
    weaknesses: [...item.weaknesses],
    advice: item.advice,
    userSummary: item.userSummary,
    aiSummary: item.aiSummary
  };

  restoreInputsFromState();
  updateUI();
  setStep(4);

  document.getElementById('report-topic').textContent = item.topic;
  document.getElementById('report-date').textContent = item.date;
  document.getElementById('report-position').textContent = item.position === 'PRO' ? '찬성' : '반대';
  document.getElementById('report-position').className = item.position === 'PRO' ? 'badge pro-badge' : 'badge con-badge';

  document.getElementById('report-summary-user').textContent = item.userSummary;
  document.getElementById('report-summary-ai').textContent = item.aiSummary;
  document.getElementById('report-advice').textContent = item.advice;

  const strengthsUl = document.getElementById('report-strengths');
  strengthsUl.innerHTML = '';
  item.strengths.forEach(str => {
    const li = document.createElement('li');
    li.textContent = str;
    strengthsUl.appendChild(li);
  });

  const weaknessesUl = document.getElementById('report-weaknesses');
  weaknessesUl.innerHTML = '';
  item.weaknesses.forEach(wk => {
    const li = document.createElement('li');
    li.textContent = wk;
    weaknessesUl.appendChild(li);
  });

  setTimeout(() => {
    updateRadialProgress('circle-logic', 'score-text-logic', item.scores.logic);
    updateRadialProgress('circle-evidence', 'score-text-evidence', item.scores.evidence);
    updateRadialProgress('circle-persuasion', 'score-text-persuasion', item.scores.persuasion);
    updateRadialProgress('circle-response', 'score-text-response', item.scores.response);
  }, 300);
}

function deleteHistoryItem(id) {
  if (!confirm("해당 토론 기록을 삭제하시겠습니까?")) return;
  state.history = state.history.filter(item => item.id !== id);
  localStorage.setItem('debatesim_history', JSON.stringify(state.history));
  renderHistory();
}

function resetDebate() {
  if (state.activeStep > 1 && state.activeStep < 4) {
    if (!confirm("현재 진행 중인 토론을 취소하고 새 토론을 시작하시겠습니까?")) return;
  }

  state.selectedTopic = '';
  state.selectedPosition = '';
  state.argument = { mainClaim: '', premise1: '', premise2: '', example: '' };
  state.rebuttal = { claim: '', premise: '', alternative: '', question: '' };
  state.userRebuttal = '';
  
  document.getElementById('input-main-claim').value = '';
  document.getElementById('count-main-claim').textContent = '0 / 200';
  document.getElementById('input-premise-1').value = '';
  document.getElementById('input-premise-2').value = '';
  document.getElementById('input-example').value = '';
  document.getElementById('input-user-rebuttal').value = '';

  stopTimer();
  timerSecondsLeft = timerPreset;
  updateTimerDisplay();
  localStorage.removeItem('debatesim_temp_state');
  
  renderTopics();
  validateStage1();
  setStep(1);
}

// ==========================================================================
// TIMERS
// ==========================================================================
function updateTimerDisplay() {
  const mins = Math.floor(timerSecondsLeft / 60);
  const secs = timerSecondsLeft % 60;
  document.getElementById('timer-display').textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function toggleTimer() {
  if (isTimerRunning) {
    stopTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  if (isTimerRunning) return;
  
  isTimerRunning = true;
  const btn = document.getElementById('btn-timer-start');
  btn.innerHTML = '<i class="fa-solid fa-pause"></i> 일시정지';
  btn.className = 'btn-timer-ctrl btn-play active';
  btn.style.backgroundColor = 'var(--color-con)';
  btn.style.color = '#fff';

  timerInterval = setInterval(() => {
    timerSecondsLeft--;
    updateTimerDisplay();

    if (timerSecondsLeft <= 0) {
      stopTimer();
      triggerTimerAlert();
    }
  }, 1000);
}

function stopTimer() {
  if (!isTimerRunning) return;
  isTimerRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;

  const btn = document.getElementById('btn-timer-start');
  btn.innerHTML = '<i class="fa-solid fa-play"></i> 시작';
  btn.style.backgroundColor = 'var(--color-accent)';
  btn.style.color = 'var(--bg-main)';
}

function resetTimer() {
  stopTimer();
  timerSecondsLeft = timerPreset;
  updateTimerDisplay();
}

function triggerTimerAlert() {
  const timerCard = document.querySelector('.timer-card');
  timerCard.style.boxShadow = '0 0 25px var(--color-con)';
  
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); 
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    oscillator.start();
    
    setTimeout(() => {
      oscillator.stop();
      audioCtx.close();
    }, 800);
  } catch (e) {
    console.warn("Audio failure:", e);
  }

  alert("선택하신 제한 시간이 완료되었습니다! 작성 내용을 검토하고 다음 단계로 이동하십시오.");
  timerCard.style.boxShadow = '0 8px 32px rgba(2, 12, 27, 0.5), var(--shadow-glow)';
}

// ==========================================================================
// EXPORTS
// ==========================================================================
async function exportTxt() {
  if (!state.report || !state.report.scores) {
    alert("토론 리포트 데이터가 유효하지 않습니다.");
    return;
  }

  const avg = Math.round((state.report.scores.logic + state.report.scores.evidence + state.report.scores.persuasion + state.report.scores.response) / 4);
  const positionText = state.selectedPosition === 'PRO' ? '찬성 (PRO)' : '반대 (CON)';

  const txtContent = `=========================================
          토론 연습 시뮬레이터 결과 리포트
=========================================
주제: ${state.selectedTopic}
입장: ${positionText}
날짜: ${state.report.date || new Date().toLocaleDateString('ko-KR')}
-----------------------------------------
[종합 점수]
* 논리 연결성: ${state.report.scores.logic}점
* 근거 활용도: ${state.report.scores.evidence}점
* 설득력: ${state.report.scores.persuasion}점
* 반론 대응력: ${state.report.scores.response}점
=> 평균 점수: ${avg}점
-----------------------------------------
[1. 내 주장 요약]
${state.report.userSummary}

[2. 상대 반론 요약]
${state.report.aiSummary}

[3. 피드백 - 강점]
${state.report.strengths.map((s, i) => `${i+1}. ${s}`).join('\n')}

[4. 피드백 - 보완점]
${state.report.weaknesses.map((w, i) => `${i+1}. ${w}`).join('\n')}

[5. 다음 토론을 위한 조언]
${state.report.advice}

=========================================
                 DebateSim
=========================================`;

  try {
    if (window.api && typeof window.api.saveTxt === 'function') {
      const result = await window.api.saveTxt(state.selectedTopic, txtContent);
      if (result.success) {
        alert(`TXT 파일이 성공적으로 저장되었습니다.\n경로: ${result.filePath}`);
      } else if (result.error) {
        alert(`저장 실패: ${result.error}`);
      }
    } else {
      const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${state.selectedTopic.replace(/[\/\\?%*:|"<>\s]/g, '_')}_토론리포트.txt`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    console.error("Failed to trigger TXT save:", err);
    alert("TXT 저장 과정에서 오류가 발생했습니다.");
  }
}

async function exportPdf() {
  if (!state.report || !state.report.scores) {
    alert("토론 리포트 데이터가 유효하지 않습니다.");
    return;
  }

  try {
    const btn = document.getElementById('btn-export-pdf');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> PDF 렌더링 중...';
    btn.disabled = true;

    if (window.api && typeof window.api.savePdf === 'function') {
      const result = await window.api.savePdf(state.selectedTopic);
      btn.innerHTML = originalText;
      btn.disabled = false;

      if (result.success) {
        alert(`PDF 파일이 성공적으로 인쇄 및 저장되었습니다.\n경로: ${result.filePath}`);
      } else if (result.error) {
        alert(`PDF 인쇄 실패: ${result.error}`);
      }
    } else {
      btn.innerHTML = originalText;
      btn.disabled = false;
      alert("브라우저 환경입니다. 출력 대상 목록에서 'PDF로 저장'을 선택해 리포트를 보관하세요.");
      window.print();
    }
  } catch (err) {
    console.error("Failed to trigger PDF save:", err);
    alert("PDF 저장 과정에서 오류가 발생했습니다.");
  }
}
