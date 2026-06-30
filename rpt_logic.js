/* 보고문 생성 로직 — v13에서 복원 (파일 끝부분 잘림으로 유실되어 별도 파일로 복구) */
(function(){

  var DOW = ['일','월','화','수','목','금','토']; // 보고문 IIFE 전용 요일 shim (메인 DOW 스코프 격리 대응)
  var SILO_INFO = { S1:{name:'광주 ST',color:'var(--s1)',cap:4000}, S2:{name:'전남 ST',color:'var(--s2)',cap:2000}, S4:{name:'나주 ST',color:'var(--s4)',cap:500}, S3:{name:'순천 ST',color:'var(--s3)',cap:1000} };
  var _rptInRows = 0, _rptMoistRows = 0;
  var fmt = function(n){ try{ return Math.round(n).toLocaleString(); }catch(e){ return n; } };
  function getStock(){ var o={S1:0,S2:0,S3:0,S4:0}; try{ if(typeof SILOS!=='undefined') SILOS.forEach(function(s){ o[s.id]=s.cur; }); }catch(e){} return o; }
  function getUsage(){
    var ud={},ubs={};
    try{ ud=JSON.parse(localStorage.getItem('_usageData_v1')||localStorage.getItem('_usageData_v5')||'{}'); }catch(e){}
    try{ ubs=JSON.parse(localStorage.getItem('_usageDataBySilo_v1')||localStorage.getItem('_usageDataBySilo_v5')||'{}'); }catch(e){}
    var out={};
    Object.keys(ud).forEach(function(d){
      var tot=(typeof ud[d]==='number')?ud[d]:(ud[d]&&ud[d].total?ud[d].total:0);
      var rg=ubs[d]; var bs= rg ? {S1:rg.GJ||0,S2:rg.JN||0,S4:rg.NJ||0,S3:rg.SC||0} : null;
      out[d]={total:tot,bySilo:bs};
    });
    return out;
  }
  function showToast(m,c){ try{ toast(c==='#f85149'?'red':'green','',m); }catch(e){ try{console.log(m);}catch(_){} } }
  function getDB(y){ try{ if(typeof db==='undefined')return []; return db.filter(function(r){ return (r.datetime||'').slice(0,4)===String(y); }); }catch(e){ return []; } }
  function normalizePcRec(r){ if(r&&typeof r==='object'&&!Array.isArray(r)){ return {date:(r.datetime||'').slice(0,10), silo:r.silo||'', ton:r.net||0, origin:r.origin||null, isPc:true}; } return {date:'',silo:'',ton:0,origin:null}; }

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function today() {
  return ymd(new Date());
}
function fmtDateKo(dateStr) {
  // "2026-06-01" → "6/1(월)"
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth()+1}/${d.getDate()}(${DOW[d.getDay()]})`;
}
function fallbackCopy(text, btn) {
  // 방법2: textarea select + execCommand (모바일 파일 환경 대응)
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px;';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length); // iOS 대응
  try {
    const ok = document.execCommand('copy');
    if (ok) {
      if (btn) { btn.textContent = '✅ 복사됨!'; setTimeout(() => btn.textContent = '📋 복사', 1800); }
      showToast('✅ 복사 완료');
    } else {
      showToast('복사 실패 — 텍스트를 길게 눌러 직접 복사하세요', '#f85149');
    }
  } catch(e) {
    showToast('복사 실패 — 텍스트를 길게 눌러 직접 복사하세요', '#f85149');
  }
  document.body.removeChild(ta);
}
function autoLoadInbound() {
  const from = document.getElementById('rpt-from').value;
  const to   = document.getElementById('rpt-to').value;
  if (!from || !to) return;
  if (from > to) { showToast('시작일이 종료일보다 늦습니다', '#f85149'); return; }

  // 해당 기간 연도들의 DB 합산
  const fromYear = parseInt(from.slice(0,4));
  const toYear   = parseInt(to.slice(0,4));
  let allRecs = [];
  for (let y = fromYear; y <= toYear; y++) {
    allRecs = allRecs.concat(getDB(y));
  }

  // 기간 필터 (normalizePcRec으로 PC/모바일 통합 파싱)
  const recs = allRecs
    .map(r => normalizePcRec(r))
    .filter(r => r.date && r.date >= from && r.date <= to && r.ton > 0);

  // 날짜별 + 지자체(origin) 기준 집계
  // 임시보관 레코드는 origin(출처 저장조)을, 일반 레코드는 silo를 기준으로 사용
  const byDate = {};
  recs.forEach(r => {
    const d    = r.date;
    const key  = r.origin || r.silo;  // origin 우선 — 지자체 기준
    const ton  = r.ton;
    if (!d || !key) return;
    if (!byDate[d]) byDate[d] = {};
    byDate[d][key] = (byDate[d][key]||0) + ton;
  });

  const dates = Object.keys(byDate).sort();
  const totalTon = recs.reduce((s,r) => s + r.ton, 0);
  const siloSum  = {};
  recs.forEach(r => {
    const key = r.origin || r.silo;
    if (!key) return;
    siloSum[key] = (siloSum[key]||0) + r.ton;
  });

  // 미리보기 렌더
  const prevEl = document.getElementById('rpt-auto-preview');
  if (!recs.length) {
    prevEl.innerHTML = `<div style="background:rgba(248,81,73,0.1);border:1px solid rgba(248,81,73,0.3);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--red);">
      ⚠️ ${from} ~ ${to} 기간 입고 데이터 없음</div>`;
    return;
  }

  const siloDetail = Object.entries(siloSum)
    .map(([k,v]) => `<span style="color:${SILO_INFO[k]?.color||'#fff'}">${SILO_INFO[k]?.name||k} ${v.toFixed(3)}톤</span>`)
    .join(' · ');

  let rows = '';
  dates.forEach(d => {
    const silos = Object.entries(byDate[d]);
    silos.forEach(([silo, ton]) => {
      const info = SILO_INFO[silo]||{name:silo,color:'var(--text2)'};
      rows += `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;">
        <span>${fmtDateKo(d)} · <span style="color:${info.color};font-weight:700;">${info.name}</span></span>
        <span style="font-family:'IBM Plex Mono',monospace;">${ton.toFixed(3)}톤</span>
      </div>`;
    });
  });

  prevEl.innerHTML = `
    <div style="background:rgba(88,166,255,0.08);border:1px solid rgba(88,166,255,0.25);border-radius:8px;padding:10px 12px;margin-bottom:6px;">
      <div style="font-size:11px;color:var(--text2);margin-bottom:6px;">${from} ~ ${to} · ${recs.length}건</div>
      ${rows}
      <div style="border-top:1px solid var(--border);margin-top:6px;padding-top:6px;font-size:12px;font-weight:700;">
        합계 ${totalTon.toFixed(3)}톤 &nbsp;·&nbsp; ${siloDetail}
      </div>
    </div>`;

  // 입고 행 자동 채우기 (날짜별·저장조별)
  document.getElementById('rpt-inbound-rows').innerHTML = '';
  _rptInRows = 0;
  dates.forEach(d => {
    Object.entries(byDate[d]).forEach(([silo, ton]) => {
      addRptInRow(d, Math.round(ton * 1000) / 1000, silo);
    });
  });

  // 사용량 기간 집계
  const usage = getUsage();
  const useDailyEntries = Object.entries(usage).filter(([d]) => d >= from && d <= to);
  const useEl = document.getElementById('rpt-use-auto-preview');
  if (useDailyEntries.length > 0) {
    // 날짜별 사용량 상세 (보고문용 미리보기)
    const useLines = useDailyEntries.sort(([a],[b])=>a.localeCompare(b)).map(([d,v]) => {
      const tot = v.total||v||0;
      if (v.bySilo) {
        const siloDetail = Object.entries(v.bySilo)
          .filter(([,t]) => t>0)
          .map(([k,t]) => `${Math.round(t)}톤:${SILO_INFO[k]?.name||k}`).join(', ');
        return `${fmtDateKo(d)} ${Math.round(tot)}톤 (${siloDetail})`;
      }
      return `${fmtDateKo(d)} ${Math.round(tot)}톤`;
    });
    const useSum = useDailyEntries.reduce((s,[,v])=>s+(v.total||v||0),0);
    document.getElementById('rpt-use-ton').value = Math.round(useSum);
    useEl.innerHTML = `<div style="background:rgba(248,81,73,0.08);border:1px solid rgba(248,81,73,0.25);border-radius:8px;padding:7px 12px;font-size:12px;color:var(--red);">
      🔥 기간 사용량 합계 <b>${fmt(useSum)}</b>톤<br>
      <span style="color:var(--text2);font-size:11px;">${useLines.join('<br>')}</span>
    </div>`;
  } else {
    useEl.innerHTML = `<div style="font-size:11px;color:var(--text2);">기간 내 일별 사용량 데이터 없음 — 직접 입력하세요</div>`;
  }

  showToast(`✅ ${recs.length}건 집계 완료`);
  updateTotalInDefault();
}
function initRptForm() {
  // 기준일/기간 기본값은 현재 선택된 구분(전일/주간)에 맞춰 applyRptPeriodDefaults()가 계산
  applyRptPeriodDefaults(document.getElementById('rpt-type')?.value || 'daily');
  addRptInRow();
  // 수분 행: 전날 날짜로 기본 1개
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  addRptMoistRow(ymd(yesterday), ''); // 날짜 선택칸 기본값=전일
  // 재고 자동 불러오기
  loadCurrentStock();
}
function renderRptInputs() {
  // 현재는 타입별 특이사항 없음 — 확장용
}

function addRptInRow(date='', ton='', silo='') {
  _rptInRows++;
  const id = _rptInRows;
  const div = document.createElement('div');
  div.id = `rpt-in-row-${id}`;
  div.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px;';
  div.innerHTML = `
    <input type="date" id="rpt-in-date-${id}" class="form-input" value="${date}"
      style="flex:1.2;margin-bottom:0;font-size:12px;">
    <input type="number" id="rpt-in-ton-${id}" class="form-input" value="${ton}"
      placeholder="톤" style="flex:0.8;margin-bottom:0;">
    <select id="rpt-in-silo-${id}" class="form-select" style="flex:1;margin-bottom:0;font-size:12px;">
      <option value="">전체</option>
      <option value="S1"${silo==='S1'?' selected':''}>광주</option>
      <option value="S2"${silo==='S2'?' selected':''}>전남</option>
      <option value="S4"${silo==='S4'?' selected':''}>나주</option>
      <option value="S3"${silo==='S3'?' selected':''}>순천</option>
    </select>
    <button onclick="document.getElementById('rpt-in-row-${id}').remove()"
      style="background:none;border:none;color:var(--red);font-size:18px;cursor:pointer;padding:0 4px;">×</button>`;
  document.getElementById('rpt-inbound-rows').appendChild(div);
}

function addRptMoistRow(dateVal='', pct='') {
  _rptMoistRows++;
  const id = _rptMoistRows;
  // YYYY-MM-DD 형태만 날짜로 사용(레거시 라벨은 무시)
  const dv = /^\d{4}-\d{2}-\d{2}$/.test(dateVal) ? dateVal : '';
  const div = document.createElement('div');
  div.id = `rpt-moist-row-${id}`;
  div.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px;';
  div.innerHTML = `
    <input type="date" id="rpt-moist-date-${id}" class="form-input" value="${dv}"
      style="flex:1.2;margin-bottom:0;font-size:12px;">
    <input type="number" id="rpt-moist-pct-${id}" class="form-input" value="${pct}"
      placeholder="%" step="0.1" style="flex:0.8;margin-bottom:0;">
    <span style="font-size:12px;color:var(--text2);white-space:nowrap;">%</span>
    <button onclick="document.getElementById('rpt-moist-row-${id}').remove()"
      style="background:none;border:none;color:var(--red);font-size:18px;cursor:pointer;padding:0 4px;">×</button>`;
  document.getElementById('rpt-moist-rows').appendChild(div);
}

function updateRptStockMode() {
  const a = document.getElementById('rpt-chk-jijache');
  const b = document.getElementById('rpt-chk-silo');
  if (!a.checked && !b.checked) a.checked = true; // 최소 하나 유지
}

function setRptType(type) {
  document.getElementById('rpt-type').value = type;
  const weeklyBtn = document.getElementById('rpt-type-btn-weekly');
  const dailyBtn  = document.getElementById('rpt-type-btn-daily');
  const activeStyle   = 'background:var(--accent);border-color:var(--accent);color:#0d1117;font-weight:700;';
  const inactiveStyle = 'background:var(--bg2);border-color:var(--border);color:var(--text2);font-weight:600;';
  weeklyBtn.style.cssText = weeklyBtn.style.cssText.replace(/background:[^;]+;|border-color:[^;]+;|color:[^;]+;|font-weight:[^;]+;/g, '') + (type === 'weekly' ? activeStyle : inactiveStyle);
  dailyBtn.style.cssText  = dailyBtn.style.cssText.replace(/background:[^;]+;|border-color:[^;]+;|color:[^;]+;|font-weight:[^;]+;/g, '') + (type === 'daily' ? activeStyle : inactiveStyle);
  applyRptPeriodDefaults(type);
  autoLoadInbound();
  updateTotalInDefault();
}

function rptPeriodChanged(which) {
  const type  = document.getElementById('rpt-type')?.value;
  const fromEl = document.getElementById('rpt-from');
  const toEl   = document.getElementById('rpt-to');
  if (type === 'daily') {
    if (which === 'from' && fromEl && toEl) toEl.value = fromEl.value;
    if (which === 'to'   && fromEl && toEl) fromEl.value = toEl.value;
  }
  autoLoadInbound();
}

function generateReport() {
  // 재고 자동 불러오기
  loadCurrentStock();

  const date    = document.getElementById('rpt-date').value;
  const type    = document.getElementById('rpt-type').value;
  const useTon  = parseFloat(document.getElementById('rpt-use-ton').value) || 0;
  const useSilo = document.getElementById('rpt-use-silo').value;
  const s1 = parseFloat(document.getElementById('rpt-s1').value) || 0;
  const s2 = parseFloat(document.getElementById('rpt-s2').value) || 0;
  const s4 = parseFloat(document.getElementById('rpt-s4').value) || 0;
  const s3 = parseFloat(document.getElementById('rpt-s3').value) || 0;

  if (!date) { showToast('기준일을 입력하세요', '#f85149'); return; }

  const typeLabel = type === 'weekly' ? '주간' : '전일기준';

  // ── 입고 행 수집 ──
  const inRows = [];
  document.querySelectorAll('[id^="rpt-in-row-"]').forEach(row => {
    const id   = row.id.replace('rpt-in-row-','');
    const d    = document.getElementById(`rpt-in-date-${id}`)?.value || '';
    const ton  = parseFloat(document.getElementById(`rpt-in-ton-${id}`)?.value) || 0;
    const silo = document.getElementById(`rpt-in-silo-${id}`)?.value || '';
    if (ton > 0) inRows.push({ date: d, ton, silo });
  });

  // 날짜별로 같은 날 여러 저장조 합치기
  const byDate = {};
  inRows.forEach(r => {
    if (!byDate[r.date]) byDate[r.date] = {};
    byDate[r.date][r.silo] = (byDate[r.date][r.silo]||0) + r.ton;
  });

  const totalIn = inRows.reduce((s,r) => s+r.ton, 0);

  // 저장조 → 지자체 매핑 (S1+S2=광주, S3=순천, S4=나주)
  const SILO_TO_JJ  = { S1:'광주', S2:'광주', S3:'순천', S4:'나주' };
  // 일별 상세용: ST 없는 이름, 표시 순서 S1→S2→S3→S4
  const SILO_NM     = { S1:'광주', S2:'전남', S3:'순천', S4:'나주' };
  const SILO_RPT_ORD = ['S1','S2','S3','S4'];

  // 총입고 요약 — 지자체 기준 합산
  const jjSum = {};
  inRows.forEach(r => {
    if (!r.silo) return;
    const jj = SILO_TO_JJ[r.silo] || (SILO_INFO[r.silo]?.name||r.silo).replace(' ST','');
    jjSum[jj] = (jjSum[jj]||0) + r.ton;
  });
  const JJ_ORD = ['광주','순천','나주'];
  const jjEntries = JJ_ORD.filter(k => jjSum[k]);
  let totalInStr = '';
  if (jjEntries.length === 0) {
    totalInStr = `${Math.round(totalIn)}톤`;
  } else if (jjEntries.length === 1) {
    totalInStr = `${Math.round(totalIn)}톤(${jjEntries[0]})`;
  } else {
    const detail = jjEntries.map(k => `${Math.round(jjSum[k])}톤:${k}`).join(', ');
    totalInStr = `${Math.round(totalIn)}톤 (${detail})`;
  }

  // 일별 상세 — 지자체 기준, 광주→전남→순천→나주 순서 (ST 없음)
  let inDetail = '';
  if (inRows.length > 0) {
    const dates = Object.keys(byDate).sort();
    inDetail = dates.map(d => {
      // 순서 정렬 후 ST 없는 이름으로
      const ordered = SILO_RPT_ORD
        .filter(k => byDate[d][k] > 0)
        .map(k => [k, byDate[d][k]]);
      const dayTot = ordered.reduce((s,[,t]) => s+t, 0);
      if (ordered.length === 1) {
        const nm = SILO_NM[ordered[0][0]] || ordered[0][0];
        return `${fmtDateKo(d)} : ${Math.round(dayTot)}톤(${nm})`;
      }
      const detail = ordered.map(([k,t]) => `${Math.round(t)}톤:${SILO_NM[k]||k}`).join(', ');
      return `${fmtDateKo(d)} : ${Math.round(dayTot)}톤 (${detail})`;
    }).join('\n');
  }

  // 사용량 - 기간 내 날짜별 데이터 우선, 없으면 수동 입력값 사용
  const usage = getUsage();
  const from  = document.getElementById('rpt-from')?.value || '';
  const to    = document.getElementById('rpt-to')?.value   || date;
  const useDailyEntries = from
    ? Object.entries(usage).filter(([d]) => d >= from && d <= to).sort(([a],[b]) => a.localeCompare(b))
    : [];

  let useStr = '';
  if (useDailyEntries.length > 0) {
    // 날짜별 사용량 (저장조별 내역 포함)
    const useLines = useDailyEntries.map(([d, v]) => {
      const tot = v.total || v || 0;
      if (v.bySilo) {
        const detail = Object.entries(v.bySilo)
          .filter(([,t]) => t > 0)
          .map(([k,t]) => `${Math.round(t)}톤:${SILO_INFO[k]?.name||k}`).join(', ');
        return `- ${fmtDateKo(d)} ${Math.round(tot)}톤 (${detail})`;
      }
      return `- ${fmtDateKo(d)} ${Math.round(tot)}톤`;
    });
    useStr = useLines.join('\n');
  } else if (!useSilo && useTon === 0) {
    useStr = '- 설비 정지중';
  } else if (useTon > 0) {
    const nm = useSilo === 'ALL' ? '' : useSilo ? ` (${SILO_INFO[useSilo]?.name||''})` : '';
    useStr = `- ${Math.round(useTon)}톤${nm}`;
  } else {
    useStr = '- 설비 정지중';
  }

  // 재고 유형 선택
  const showJijache = document.getElementById('rpt-chk-jijache')?.checked;
  const showSilo    = document.getElementById('rpt-chk-silo')?.checked;

  // 저장조별 재고
  const total = s1+s2+s4+s3;
  const siloLines = [];
  if (s1!==0) siloLines.push(`  광주 ST : ${String(Math.round(s1)).padStart(6)}톤`);
  if (s2!==0) siloLines.push(`  전남 ST : ${String(Math.round(s2)).padStart(6)}톤`);
  if (s4!==0) siloLines.push(`  나주 ST : ${String(Math.round(s4)).padStart(6)}톤`);
  if (s3!==0) siloLines.push(`  순천 ST : ${String(Math.round(s3)).padStart(6)}톤`);
  siloLines.push(`  전체    : ${String(Math.round(total)).padStart(6)}톤`);

  // 지자체별 재고 (임시보관 반영) — 대시보드와 동일 계산(calcOwnershipDetail) 우선 사용
  let gjStock = 0, njStock = 0, scStock = 0;
  try {
    if (typeof calcOwnershipDetail === 'function') {
      // 대시보드 KPI와 완전히 동일한 소유 기준 계산 (앱=PC 일치 보장)
      var _own = calcOwnershipDetail();
      gjStock = ((_own.S1 && _own.S1.total) || 0) + ((_own.S2 && _own.S2.total) || 0); // 광주 = 광주ST + 전남ST 소유분
      njStock = (_own.S4 && _own.S4.total) || 0;
      scStock = (_own.S3 && _own.S3.total) || 0;
    } else {
      // 폴백: _tempStorage 직접 계산 (구버전 호환)
      const raw = localStorage.getItem('_tempStorage');
      if (raw) {
        const bySilo = JSON.parse(raw);
        const selfS1 = Math.max(0, s1 - (bySilo.S1?.total||0));
        const selfS2 = Math.max(0, s2 - (bySilo.S2?.total||0));
        const selfS4 = Math.max(0, s4 - (bySilo.S4?.total||0));
        const selfS3 = Math.max(0, s3 - (bySilo.S3?.total||0));
        gjStock = selfS1 + selfS2; njStock = selfS4; scStock = selfS3;
        Object.entries(bySilo).forEach(([siloId, d]) => {
          Object.entries(d.origins||{}).forEach(([originId, amt]) => {
            const nm = (SILO_INFO[originId]?.name||'');
            if (nm.includes('나주')) njStock += amt;
            else if (nm.includes('순천')) scStock += amt;
            else gjStock += amt;
          });
        });
      } else { gjStock = s1+s2; njStock = s4; scStock = s3; }
    }
  } catch(e) { gjStock = s1+s2; njStock = s4; scStock = s3; }

  const jijacheLines = [];
  jijacheLines.push(`  광주 : ${String(Math.round(gjStock)).padStart(6)}톤`);
  jijacheLines.push(`  나주 : ${String(Math.round(njStock)).padStart(6)}톤`);
  jijacheLines.push(`  순천 : ${String(Math.round(scStock)).padStart(6)}톤`);
  jijacheLines.push(`  전체 : ${String(Math.round(gjStock+njStock+scStock)).padStart(6)}톤`);

  // 선택에 따라 stockLines 조합
  const stockLines = [];
  if (showJijache && showSilo) {
    stockLines.push('▷ 지자체별', ...jijacheLines, '▷ 저장조별', ...siloLines);
  } else if (showSilo) {
    stockLines.push(...siloLines);
  } else {
    // 기본: 지자체별
    stockLines.push(...jijacheLines);
  }

  // 수분
  const moistRows = [];
  document.querySelectorAll('[id^="rpt-moist-row-"]').forEach(row => {
    const id  = row.id.replace('rpt-moist-row-','');
    const _dv = document.getElementById(`rpt-moist-date-${id}`)?.value || ''; const lbl = _dv ? fmtDateKo(_dv) : (document.getElementById(`rpt-moist-label-${id}`)?.value.trim()||'');
    const pct = parseFloat(document.getElementById(`rpt-moist-pct-${id}`)?.value)||0;
    if (pct>0) moistRows.push({lbl,pct});
  });

  // ── 보고문 조합 ──
  const showTotalIn = document.getElementById('rpt-chk-totalin')?.checked;
  const dateKo = fmtDateKo(date);
  let text = `-${dateKo} 연료관리현황-\n\n`;
  text += `1. 입고량\n`;
  if (totalIn > 0) {
    if (showTotalIn) text += `총입고 : ${totalInStr}\n`;
    if (inDetail) text += inDetail + '\n';
  } else {
    text += `- 입고 없음\n`;
  }
  text += `\n2. 사용량\n${useStr}\n`;
  text += `\n3. 재고량(금일 00시 기준)\n${stockLines.join('\n')}\n`;
  if (moistRows.length > 0) {
    text += `\n4. 수분\n`;
    moistRows.forEach(r => { text += `- ${r.lbl} : ${r.pct}%\n`; });
  }

  document.getElementById('rpt-text').textContent = text.trim();
  document.getElementById('rpt-output').style.display = 'block';
  document.getElementById('rpt-output').scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function copyReport() {
  const text = document.getElementById('rpt-text').textContent;
  const btn  = document.getElementById('rpt-copy-btn');

  // 방법1: clipboard API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = '✅ 복사됨!';
      setTimeout(() => btn.textContent = '📋 복사', 1800);
    }).catch(() => fallbackCopy(text, btn));
  } else {
    fallbackCopy(text, btn);
  }
}

function applyRptPeriodDefaults(type) {
  const now = new Date();
  const dateEl = document.getElementById('rpt-date');
  const fromEl = document.getElementById('rpt-from');
  const toEl   = document.getElementById('rpt-to');
  // 기준일(보고서 제목)은 보고서를 작성하는 날짜 = 항상 오늘
  if (dateEl) dateEl.value = today();
  if (type === 'daily') {
    // 전일: 집계 기간은 어제 하루만
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    const yStr = ymd(y);
    if (fromEl) fromEl.value = yStr;
    if (toEl)   toEl.value   = yStr;
  } else { // weekly
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay()+6)%7));
    if (fromEl) fromEl.value = ymd(mon);
    if (toEl)   toEl.value   = today();
  }
}

function loadCurrentStock(manual = false) {
  const stock = getStock();
  document.getElementById('rpt-s1').value = Math.round(stock.S1||0);
  document.getElementById('rpt-s2').value = Math.round(stock.S2||0);
  document.getElementById('rpt-s4').value = Math.round(stock.S4||0);
  document.getElementById('rpt-s3').value = Math.round(stock.S3||0);
  if (manual) showToast('✅ 현재 재고 불러오기 완료');
}

function updateTotalInDefault() {
  const type = document.getElementById('rpt-type')?.value;
  const chk  = document.getElementById('rpt-chk-totalin');
  if (!chk) return;
  const dateSet = new Set();
  document.querySelectorAll('[id^="rpt-in-date-"]').forEach(el => { if (el.value) dateSet.add(el.value); });
  chk.checked = (type === 'weekly' && dateSet.size >= 4);
}
  try{ window.initRptForm = initRptForm; }catch(e){}
  try{ window.renderRptInputs = renderRptInputs; }catch(e){}
  try{ window.addRptInRow = addRptInRow; }catch(e){}
  try{ window.addRptMoistRow = addRptMoistRow; }catch(e){}
  try{ window.updateRptStockMode = updateRptStockMode; }catch(e){}
  try{ window.setRptType = setRptType; }catch(e){}
  try{ window.rptPeriodChanged = rptPeriodChanged; }catch(e){}
  try{ window.generateReport = function(){ try{ return generateReport.apply(this,arguments); }catch(e){ try{ var t=document.getElementById('rpt-text'),o=document.getElementById('rpt-output'); if(t&&o){ t.textContent='⚠️ 보고문 생성 오류: '+(e&&e.message||e); o.style.display='block'; o.scrollIntoView&&o.scrollIntoView({block:'nearest'}); } else alert('보고문 생성 오류: '+(e&&e.message||e)); }catch(_){ alert('보고문 생성 오류: '+(e&&e.message||e)); } console.error('[generateReport]',e); } }; }catch(e){}
  try{ window.copyReport = copyReport; }catch(e){}
  try{ window.applyRptPeriodDefaults = applyRptPeriodDefaults; }catch(e){}
  try{ window.loadCurrentStock = loadCurrentStock; }catch(e){}
  try{ window.updateTotalInDefault = updateTotalInDefault; }catch(e){}
  try{ window.autoLoadInbound = function(){ try{ return autoLoadInbound.apply(this,arguments); }catch(e){ try{ var p=document.getElementById('rpt-auto-preview'); if(p){ p.innerHTML='<div style=\'color:#f87171;font-size:12px;padding:8px;\'>⚠️ 불러오기 오류: '+(e&&e.message||e)+'</div>'; } else alert('불러오기 오류: '+(e&&e.message||e)); }catch(_){ alert('불러오기 오류: '+(e&&e.message||e)); } console.error('[autoLoadInbound]',e); } }; }catch(e){}
  try{ console.log("[보고문] 로드 완료 (rpt_logic.js)"); }catch(e){}
})();
