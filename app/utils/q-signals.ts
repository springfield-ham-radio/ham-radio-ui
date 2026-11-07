/**
 * Q groups amateurs actually hear, with the ITU question and the ITU answer.
 * Source: Recommendation ITU-R M.1172 (maritime mobile service Q code).
 * A group followed by ? (or RQ on phone) is the question. Without that, it is
 * the statement or advice. C / NO (Charlie / NO) can affirm or negate a group.
 *
 * Amateur operating notes are labeled and are not a second official meaning.
 * QST is not an ITU Q code; it is not listed.
 */

export interface QSignal {
  code: string;
  question: string;
  statement: string;
  /** Amateur operating custom. Not the ITU meaning. */
  operatingNote?: string;
}

export const Q_SIGNALS: readonly QSignal[] = [
  {
    code: 'QRG',
    question: 'Will you tell me my exact frequency (or that of …)?',
    statement: 'Your exact frequency (or that of …) is … kHz (or MHz).',
  },
  {
    code: 'QRK',
    question: 'What is the intelligibility of my signals (or those of …)?',
    statement:
      'The intelligibility of your signals (or those of …) is … (1 bad, 2 poor, 3 fair, 4 good, 5 excellent).',
  },
  {
    code: 'QRL',
    question: 'Are you busy?',
    statement: 'I am busy (or I am busy with …). Please do not interfere.',
  },
  {
    code: 'QRM',
    question: 'Is my transmission being interfered with?',
    statement:
      'Your transmission is being interfered with … (1 nil, 2 slightly, 3 moderately, 4 severely, 5 extremely).',
  },
  {
    code: 'QRN',
    question: 'Are you troubled by static?',
    statement: 'I am troubled by static … (1 nil, 2 slightly, 3 moderately, 4 severely, 5 extremely).',
  },
  {
    code: 'QRO',
    question: 'Shall I increase transmitter power?',
    statement: 'Increase transmitter power.',
  },
  {
    code: 'QRP',
    question: 'Shall I decrease transmitter power?',
    statement: 'Decrease transmitter power.',
    operatingNote: 'Amateurs also say “QRP” to mean the station is running low power. That is operating custom, not the ITU answer.',
  },
  {
    code: 'QRQ',
    question: 'Shall I send faster?',
    statement: 'Send faster (… words per minute).',
  },
  {
    code: 'QRS',
    question: 'Shall I send more slowly?',
    statement: 'Send more slowly (… words per minute).',
  },
  {
    code: 'QRT',
    question: 'Shall I stop sending?',
    statement: 'Stop sending.',
  },
  {
    code: 'QRU',
    question: 'Have you anything for me?',
    statement: 'I have nothing for you.',
  },
  {
    code: 'QRV',
    question: 'Are you ready?',
    statement: 'I am ready.',
  },
  {
    code: 'QRX',
    question: 'When will you call me again?',
    statement: 'I will call you again at … hours on … kHz (or MHz).',
  },
  {
    code: 'QRZ',
    question: 'Who is calling me?',
    statement: 'You are being called by … (on … kHz (or MHz)).',
  },
  {
    code: 'QSA',
    question: 'What is the strength of my signals (or those of …)?',
    statement:
      'The strength of your signals (or those of …) is … (1 scarcely perceptible, 2 weak, 3 fairly good, 4 good, 5 very good).',
  },
  {
    code: 'QSB',
    question: 'Are my signals fading?',
    statement: 'Your signals are fading.',
  },
  {
    code: 'QSD',
    question: 'Are my signals mutilated?',
    statement: 'Your signals are mutilated.',
  },
  {
    code: 'QSK',
    question: 'Can you hear me between your signals and if so may I break in on your transmission?',
    statement: 'I can hear you between my signals; break in on my transmission.',
  },
  {
    code: 'QSL',
    question: 'Can you acknowledge receipt?',
    statement: 'I am acknowledging receipt.',
  },
  {
    code: 'QSO',
    question: 'Can you communicate with … direct (or by relay)?',
    statement: 'I can communicate with … direct (or by relay through …).',
  },
  {
    code: 'QSP',
    question: 'Will you relay to … free of charge?',
    statement: 'I will relay to … free of charge.',
  },
  {
    code: 'QSY',
    question: 'Shall I change to transmission on another frequency?',
    statement: 'Change to transmission on another frequency (or on … kHz or MHz).',
  },
  {
    code: 'QTH',
    question: 'What is your position in latitude and longitude (or according to any other indication)?',
    statement: 'My position is … latitude, … longitude (or according to any other indication).',
  },
  {
    code: 'QTR',
    question: 'What is the correct time?',
    statement: 'The correct time is … hours.',
  },
];

export function filterQSignals(query: string): QSignal[] {
  const needle = query.trim().toLowerCase();

  if (!needle) {
    return [...Q_SIGNALS];
  }

  return Q_SIGNALS.filter((signal) => {
    const haystack = [signal.code, signal.question, signal.statement, signal.operatingNote ?? '']
      .join(' ')
      .toLowerCase();

    return haystack.includes(needle);
  });
}
