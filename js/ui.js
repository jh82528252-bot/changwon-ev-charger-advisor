function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderRecommendationPanel(recArea, input, result) {
  if (result.status === "INVALID_INPUT") {
    recArea.innerHTML = `
      <div class="error-card">
        <span class="badge badge-bad">입력 오류</span>
        <strong>입력값을 확인해 주세요.</strong>
        <ul style="margin:8px 0 0;padding-left:20px;">
          ${result.errors.map(err => `<li>${escapeHtml(err)}</li>`).join("")}
        </ul>
      </div>
    `;
    return;
  }

  if (result.status === "ALREADY_CHARGED") {
    recArea.innerHTML = `
      <div class="rec-card">
        <span class="badge badge-ok">충전 불필요</span>
        <strong>현재 SOC(${escapeHtml(input.currentSoc)}%)가 목표 SOC(${escapeHtml(input.targetSoc)}%) 이상입니다.</strong>
        <p style="margin:6px 0 0;">즉시 충전이 필요하지 않습니다.</p>
      </div>
    `;
    return;
  }

  if (result.status === "NO_AVAILABLE_STATION") {
    recArea.innerHTML = `
      <div class="error-card">
        <span class="badge badge-bad">이용 불가</span>
        <strong>현재 정상 이용 가능한 충전소가 없습니다.</strong>
        <p style="margin:6px 0 0;">충전기 상태(점검·통신장애)를 확인하거나 다른 시간대·거점으로 다시 조회해 주세요.</p>
      </div>
    `;
    return;
  }

  const ideal = result.recommended;
  const reasons = [];
  if (!ideal.meetsOcc) reasons.push(`예상 가동률 ${ideal.occRate}%(기준 60% 미만 초과)`);
  if (!ideal.meetsDetour) reasons.push(`추가 이동 ${ideal.extraDetourMin}분(기준 5분 이내 초과)`);
  if (!ideal.meetsDwell) {
    reasons.push(`예상 대기+충전 ${ideal.waitMin + ideal.chargeMin}분 > 체류 ${input.dwellMin}분`);
  }

  const cardClass = result.isFallback ? "alert-card" : "rec-card";
  const badgeText = result.isFallback ? "대체 추천 충전소(총 소요 최단)" : "최적 추천 충전소";

  recArea.innerHTML = `
    <div class="${cardClass}">
      <div style="margin-bottom:6px;">
        <span class="badge ${result.isFallback ? "badge-warn" : "badge-ok"}">${escapeHtml(badgeText)}</span>
        <span class="badge badge-sim">시뮬레이션/계산 결과</span>
      </div>
      <div style="font-size:1.15rem;font-weight:700;">${escapeHtml(ideal.name)} (${escapeHtml(ideal.region)})</div>
      <div style="font-size:0.85rem;color:#374151;margin-top:2px;">
        충전기: ${escapeHtml(ideal.type)} ${escapeHtml(ideal.ratedKw)}kW | 필요 충전량: <strong>${escapeHtml(ideal.neededKwh)} kWh</strong> |
        체류 시간(${escapeHtml(input.dwellMin)}분) 내 대기+충전 완료: <strong>${ideal.meetsDwell ? "가능" : "초과"}</strong>
      </div>
      ${result.isFallback ? `<p style="margin:8px 0 0;color:#92400e;font-size:0.85rem;">
        ※ 초기 기준을 모두 만족하는 충전소가 없어 총 소요 시간 기준 대체 충전소를 안내합니다. 미충족 항목: ${escapeHtml(reasons.join(", "))}.
      </p>` : ""}
      <div class="metrics">
        <div class="metric"><div class="k">추가 이동 시간</div><div class="v">${escapeHtml(ideal.extraDetourMin)}분</div></div>
        <div class="metric"><div class="k">예상 대기 시간(추정)</div><div class="v">${escapeHtml(ideal.waitMin)}분</div></div>
        <div class="metric"><div class="k">예상 충전 시간</div><div class="v">${escapeHtml(ideal.chargeMin)}분</div></div>
        <div class="metric"><div class="k">총 소요 시간</div><div class="v">${escapeHtml(ideal.totalMin)}분</div></div>
        <div class="metric"><div class="k">비교 대비 절약(가정)</div><div class="v">${escapeHtml(result.savedMin)}분</div></div>
      </div>
    </div>

    <div style="font-size:0.9rem;font-weight:700;margin-bottom:8px;">대체 충전소 안내 (총 소요 시간 순)</div>
    ${result.alternatives.length > 0 ? result.alternatives.map(alt => `
      <div class="alt-card">
        <strong>${escapeHtml(alt.name)} (${escapeHtml(alt.region)})</strong> — ${escapeHtml(alt.type)}${escapeHtml(alt.ratedKw)}kW
        <div style="font-size:0.83rem;color:#4b5563;margin-top:4px;">
          총 소요 ${escapeHtml(alt.totalMin)}분 (이동 ${escapeHtml(alt.extraDetourMin)}분 + 대기 ${escapeHtml(alt.waitMin)}분 + 충전 ${escapeHtml(alt.chargeMin)}분) |
          예상 가동률 ${escapeHtml(alt.occRate)}\% \vert{} 체류 내 대기+충전 완료: ${alt.meetsDwell ? "가능" : "어려움"}
        </div>
      </div>
    `).join("") : `<p class="note">안내할 추가 대체 충전소가 없습니다.</p>`}
  `;
}

function renderDistributionPanel(distArea, simData) {
  if (!simData) {
    distArea.innerHTML = "";
    return;
  }
  distArea.innerHTML = `
    <div class="alt-card" style="background:#eef2ff;border-color:#c7d2fe;margin-top:12px;">
      <span class="badge badge-sim">수요 분산 시뮬레이션</span>
      <strong>피크 시간대 거점별 예상 가동률 및 추정 전력 변화(가정)</strong>
      <p style="margin:6px 0 8px;font-size:0.83rem;color:#3730a3;">${escapeHtml(simData.summary)}</p>
      <table>
        <thead>
          <tr>
            <th>거점</th>
            <th>분산 전 가동률</th>
            <th>분산 후 가동률</th>
            <th>분산 전 추정 전력</th>
            <th>분산 후 추정 전력</th>
          </tr>
        </thead>
        <tbody>
          ${simData.rows.map(r => `
            <tr>
              <td><strong>${escapeHtml(r.region)}</strong></td>
              <td>${escapeHtml(r.occBefore)}%</td>
              <td><strong>${escapeHtml(r.occAfter)}%</strong></td>
              <td>${escapeHtml(r.estKwBefore)} kW</td>
              <td>${escapeHtml(r.estKwAfter)} kW</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderStationTable(tbody, evaluated, filters) {
  let rows = [...evaluated];

  if (filters.region !== "ALL") rows = rows.filter(r => r.region === filters.region);
  if (filters.type !== "ALL") rows = rows.filter(r => r.type === filters.type);
  if (filters.avail === "AVAILABLE_ONLY") rows = rows.filter(r => r.meetsAvail);

  rows.sort((a, b) => {
    if (!a.meetsAvail && b.meetsAvail) return 1;
    if (a.meetsAvail && !b.meetsAvail) return -1;
    if (filters.sortBy === "occRate") return a.occRate - b.occRate;
    if (filters.sortBy === "waitTime") return a.waitMin - b.waitMin;
    return a.totalMin - b.totalMin;
  });

  tbody.innerHTML = rows.map(r => {
    const statusBadge = r.status === "AVAILABLE"
      ? `<span class="badge badge-ok">정상</span>`
      : r.status === "MAINTENANCE"
      ? `<span class="badge badge-bad">점검/불가</span>`
      : `<span class="badge badge-warn">통신확인필요</span>`;

    return `
      <tr>
        <td><strong>${escapeHtml(r.name)}</strong><br><span style="color:#6b7280;font-size:0.78rem;">${escapeHtml(r.region)} · ${escapeHtml(r.dataSourceType)}</span></td>
        <td>${escapeHtml(r.type)} (${escapeHtml(r.ratedKw)}kW)</td>
        <td>${statusBadge}</td>
        <td>${escapeHtml(r.occRate)}%</td>
        <td>${escapeHtml(r.extraDetourMin)}분</td>
        <td>${r.meetsAvail ? `${escapeHtml(r.waitMin)}분` : "-"}</td>
        <td>${r.meetsAvail ? `${escapeHtml(r.chargeMin)}분` : "-"}</td> <td><strong>${r.meetsAvail ? `${escapeHtml(r.totalMin)}분` : "제외"}</strong></td>
        <td>${r.meetsAvail ? (r.meetsDwell ? "가능" : "부족") : "-"}</td>
      </tr>
    `;
  }).join("");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    escapeHtml,
    renderRecommendationPanel,
    renderDistributionPanel,
    renderStationTable
  };
}
