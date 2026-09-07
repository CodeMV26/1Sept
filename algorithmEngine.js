// algorithmEngine.js

export function calcolaIndiceForma(esiti) {
  if (!esiti || esiti.length === 0) return { simboli: "N/D", punteggio: "N/D", val: 0 };
  
  let p = 0;
  let sim = "";
  esiti.forEach(e => {
    if (e === "W") { p += 1.0; sim += "🟩 "; }
    else if (e === "D") { p += 0.5; sim += "🟨 "; }
    else if (e === "L") { p += 0.0; sim += "🟥 "; }
  });

  return {
    simboli: sim.trim(),
    punteggio: p.toFixed(1) + " / 5.0",
    val: p
  };
}

export let ModelloPesi = {
  pesoForma: 0.35,
  pesoCasaTrasferta: 0.30,
  pesoPosizioneClassifica: 0.20,
  pesoAttaccoDifesa: 0.15
};

function fattoriale(n) {
  return n <= 1 ? 1 : n * fattoriale(n - 1);
}

function poisson(k, lambda) {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / fattoriale(k);
}

export function calcolaPrevisioneMatch(homeStats, awayStats, pesi = ModelloPesi) {
  const homeAttPower = homeStats.giocate > 0 ? (homeStats.homeGf / Math.max(1, homeStats.giocate / 2)) : 1.2;
  const awayDefWeakness = awayStats.giocate > 0 ? (awayStats.awayGs / Math.max(1, awayStats.giocate / 2)) : 1.2;
  const awayAttPower = awayStats.giocate > 0 ? (awayStats.awayGf / Math.max(1, awayStats.giocate / 2)) : 1.0;
  const homeDefWeakness = homeStats.giocate > 0 ? (homeStats.homeGs / Math.max(1, homeStats.giocate / 2)) : 1.0;

  const formaHome = calcolaIndiceForma(homeStats.form).val;
  const formaAway = calcolaIndiceForma(awayStats.form).val;

  let expHomeGoals = (homeAttPower * awayDefWeakness) * (1 + (formaHome - formaAway) * 0.05) * pesi.pesoAttaccoDifesa + ((homeStats.homePoints || 0) / Math.max(1, homeStats.giocate || 1)) * pesi.pesoCasaTrasferta;
  let expAwayGoals = (awayAttPower * homeDefWeakness) * (1 + (formaAway - formaHome) * 0.05) * pesi.pesoAttaccoDifesa + ((awayStats.awayPoints || 0) / Math.max(1, awayStats.giocate || 1)) * pesi.pesoCasaTrasferta;

  expHomeGoals = Math.max(0.2, expHomeGoals);
  expAwayGoals = Math.max(0.2, expAwayGoals);

  let prob1 = 0, probX = 0, prob2 = 0;
  let probOver25 = 0, probGG = 0;

  for (let h = 0; h <= 5; h++) {
    for (let a = 0; a <= 5; a++) {
      const p = poisson(h, expHomeGoals) * poisson(a, expAwayGoals);
      if (h > a) prob1 += p;
      else if (h === a) probX += p;
      else prob2 += p;

      if (h + a > 2.5) probOver25 += p;
      if (h > 0 && a > 0) probGG += p;
    }
  }

  let pronostico1X2 = "X";
  let confidenza = probX;

  if (prob1 > prob2 && prob1 > probX) {
    pronostico1X2 = prob1 - probX < 0.1 ? "1X" : "1";
    confidenza = prob1;
  } else if (prob2 > prob1 && prob2 > probX) {
    pronostico1X2 = prob2 - probX < 0.1 ? "X2" : "2";
    confidenza = prob2;
  } else if (prob1 + prob2 > 0.7) {
    pronostico1X2 = "12";
    confidenza = prob1 + prob2;
  }

  return {
    risultatoStimato: pronostico1X2,
    probabilitaPercentuale: (confidenza * 100).toFixed(1) + "%",
    probabilita1X2: { p1: (prob1 * 100).toFixed(1), pX: (probX * 100).toFixed(1), p2: (prob2 * 100).toFixed(1) },
    esitoOver25: probOver25 > 0.52 ? "OVER 2.5" : "UNDER 2.5",
    esitoGoalNoGoal: probGG > 0.50 ? "GOAL" : "NOGOAL",
    xG: { home: expHomeGoals.toFixed(2), away: expAwayGoals.toFixed(2) }
  };
}

export function eseguiBacktestingECalibrazione(archivioStorico) {
  if (!archivioStorico || archivioStorico.length < 5) {
    return { messaggio: "Storico insufficiente per la calibrazione (minimo 5 gare archiviate)." };
  }

  let miglioriPesi = { ...ModelloPesi };
  let maxAccuratezza = 0;

  for (let wForma = 0.1; wForma <= 0.5; wForma += 0.1) {
    for (let wCasa = 0.1; wCasa <= 0.5; wCasa += 0.1) {
      const pesiTest = {
        pesoForma: wForma,
        pesoCasaTrasferta: wCasa,
        pesoPosizioneClassifica: 0.2,
        pesoAttaccoDifesa: 0.2
      };

      let indovinate = 0;

      archivioStorico.forEach(match => {
        const prev = calcolaPrevisioneMatch(match.homeTeam.stats, match.awayTeam.stats, pesiTest);
        const esitoReale = match.risultatoReale.home > match.risultatoReale.away ? "1" : (match.risultatoReale.home === match.risultatoReale.away ? "X" : "2");
        
        if (prev.risultatoStimato.includes(esitoReale)) {
          indovinate++;
        }
      });

      const accuratezza = indovinate / archivioStorico.length;
      if (accuratezza > maxAccuratezza) {
        maxAccuratezza = accuratezza;
        miglioriPesi = { ...pesiTest };
      }
    }
  }

  ModelloPesi = miglioriPesi;

  return {
    pesiOttimizzati: ModelloPesi,
    accuratezzaBacktest: (maxAccuratezza * 100).toFixed(2) + "%",
    totaleGareAnalizzate: archivioStorico.length
  };
}
