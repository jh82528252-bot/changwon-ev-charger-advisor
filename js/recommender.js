const _data = typeof require !== "undefined" ? require("./data.js") : {
  getBaseOccupancyByHour,
  getSeasonDelta
};
const _calc = typeof require !== "undefined" ? require("./calculator.js") : {
  calcNeededEnergyKwh,
  calcChargingMinutes,
  calcWaitMinutes,
  canAchieveWithinDwell
};

function evaluateStations(stations, input) {
  const { region, currentSoc, targetSoc, batteryKwh, maxVehicleKw, dwellMin, hourSlot, season } = input;
  const neededKwh = _calc.calcNeededEnergyKwh(currentSoc, targetSoc, batteryKwh);
  const seasonDelta = _data.getSeasonDelta(season);

  return stations.map(st => {
    const isAvailable = st.status === "AVAILABLE";
    const baseOcc = _data.getBaseOccupancyByHour(st.region, hourSlot);
    const sameRegionBonus = st.region === region ? 0 : 3;
    const occRate = Math.min(98, baseOcc + seasonDelta);
    const extraDetourMin = st.extraDetourMin + sameRegionBonus;

    const waitMin = isAvailable ? _calc.calcWaitMinutes(st, occRate) : 999;
    const chargeMin = isAvailable
      ? _calc.calcChargingMinutes(currentSoc, targetSoc, batteryKwh, st.ratedKw, maxVehicleKw)
      : 999;
    const totalMin = isAvailable ? extraDetourMin + waitMin + chargeMin : 9999;

    const meetsAvail = isAvailable;
    const meetsOcc = occRate < 60;
    const meetsDetour = extraDetourMin <= 5;
    const meetsDwell = isAvailable && _calc.canAchieveWithinDwell(waitMin, chargeMin, dwellMin);

    let penalty = 0;
    if (!meetsAvail) penalty += 100000;
    if (!meetsOcc) penalty += 25;
    if (!meetsDetour) penalty += (extraDetourMin - 5) * 4;
    if (!meetsDwell) penalty += 40;

    const score = totalMin + penalty;

    return {
      ...st,
      neededKwh,
      occRate,
      extraDetourMin,
      waitMin,
      chargeMin,
      totalMin,
      meetsAvail,
      meetsOcc,
      meetsDetour,
      meetsDwell,
      score
    };
  });
}

function buildRecommendation(stations, input) {
  const evaluated = evaluateStations(stations, input);
  const availableList = evaluated.filter(x => x.meetsAvail);

  if (availableList.length === 0) {
    return {
      status: "NO_AVAILABLE_STATION",
      evaluated,
      recommended: null,
      isFallback: false,
      savedMin: 0,
      alternatives: []
    };
  }

  const idealCandidates = availableList
    .filter(x => x.meetsOcc && x.meetsDetour && x.meetsDwell)
    .sort((a, b) => a.totalMin - b.totalMin || a.score - b.score);

  const shortestTotalList = [...availableList].sort((a, b) => a.totalMin - b.totalMin);
  const isFallback = idealCandidates.length === 0;
  // 조건을 완전 충족하는 곳이 없으면 패널티 점수가 아닌 순수 총 소요 시간(totalMin) 최단 충전소를 선택
  const recommended = isFallback ? shortestTotalList[0] : idealCandidates[0];

  const baseline = evaluated
    .filter(x => x.meetsAvail && x.region === input.region)
    .sort((a, b) => b.totalMin - a.totalMin)[0] || shortestTotalList[shortestTotalList.length - 1];
  const savedMin = Math.max(0, baseline.totalMin - recommended.totalMin);

  const alternatives = shortestTotalList
    .filter(x => x.id !== recommended.id)
    .slice(0, 2);

  return {
    status: "OK",
    evaluated,
    recommended,
    isFallback,
    savedMin,
    alternatives
  };
}

function simulatePeakDistribution(stations, hourSlot = 20, season = "spring_fall") {
  const regions = ["중앙동", "팔용동", "석동"];
  const seasonDelta = _data.getSeasonDelta(season);

  const rawRows = regions.map(reg => {
    const regStations = stations.filter(s => s.region === reg && s.status === "AVAILABLE");
    const totalCapacityKw = regStations.reduce(
      (sum, s) => sum + s.ratedKw * Math.max(1, s.operationalChargers),
      0
    );
    const fallbackCap = totalCapacityKw > 0 ? totalCapacityKw : 200;
    const occBefore = Math.min(98, _data.getBaseOccupancyByHour(reg, hourSlot) + seasonDelta);
    const estKwBefore = Math.round(fallbackCap * (occBefore / 100));
    return { region: reg, occBefore, estKwBefore, capKw: fallbackCap };
  });

  // 가장 혼잡한 거점의 초과 부하(62% 초과분 가정)를 다른 거점으로 재배치하는 시뮬레이션
  const sorted = [...rawRows].sort((a, b) => b.occBefore - a.occBefore);
  const overloaded = sorted[0];
  const targetRate = 62;
  const targetKw = Math.round(overloaded.capKw * (targetRate / 100));
  const shiftedKw = Math.max(0, overloaded.estKwBefore - targetKw);
  const donors = sorted.slice(1);
  const perDonorKw = donors.length > 0 ? Math.round(shiftedKw / donors.length) : 0;

  const rows = rawRows.map(r => {
    if (r.region === overloaded.region) {
      return {
        ...r,
        occAfter: Math.min(65, Math.round((targetKw / r.capKw) * 100)),
        estKwAfter: targetKw
      };
    }
    const estKwAfter = r.estKwBefore + perDonorKw;
    const occAfter = Math.min(95, Math.round((estKwAfter / r.capKw) * 100));
    return {
      ...r,
      occAfter,
      estKwAfter
    };
  });

  return {
    targetPeakRate: 65,
    rows,
    summary: `${hourSlot}시(${season}) 기준 거점별 가동률·설비 용량 가정치로부터 고부하 거점 부하(${shiftedKw}kW 가정)를 주변 거점으로 분산했을 때의 시뮬레이션 결과입니다.`
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { evaluateStations, buildRecommendation, simulatePeakDistribution };
}
