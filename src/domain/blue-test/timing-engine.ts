import { BlueQuestionDefinition, BlueSessionIntro, BlueTestPackage } from '../../types/blue-test';

/**
 * Calculates max conscious time for session n (1..7) and question j (1..7) inside session.
 * Formula:
 * Ln = 1.86^n, L0 = 0
 * T(n, j) = L(n-1) + ((Ln - L(n-1)) * j / 7)
 * Raw numeric precision is returned.
 */
export function calculateMaxConsciousTimeRaw(sessionNumber: number, questionInSession: number): number {
  if (sessionNumber < 1 || sessionNumber > 7) {
    throw new Error(`Invalid sessionNumber ${sessionNumber}. Must be between 1 and 7.`);
  }
  if (questionInSession < 1 || questionInSession > 7) {
    throw new Error(`Invalid questionInSession ${questionInSession}. Must be between 1 and 7.`);
  }

  const prevL = sessionNumber === 1 ? 0 : Math.pow(1.86, sessionNumber - 1);
  const currentL = Math.pow(1.86, sessionNumber);

  return prevL + ((currentL - prevL) * questionInSession) / 7;
}

/**
 * Formats a raw time in seconds to one decimal place string (e.g., "1.9s").
 */
export function formatTimeDisplay(timeSecondsRaw: number): string {
  // Round to one decimal place
  return `${timeSecondsRaw.toFixed(1)}s`;
}

/**
 * Generates all 49 ordered questions for a Blue Test package.
 */
export function generateBlueTestQuestions(): BlueQuestionDefinition[] {
  const questions: BlueQuestionDefinition[] = [];

  for (let s = 1; s <= 7; s++) {
    for (let q = 1; q <= 7; q++) {
      const globalOrder = (s - 1) * 7 + q;
      const rawTime = calculateMaxConsciousTimeRaw(s, q);
      const displayTime = formatTimeDisplay(rawTime);

      questions.push({
        id: `blue-q-s${s}-q${q}`,
        sessionNumber: s,
        questionInSession: q,
        globalOrder,
        maxTimeSecondsRaw: rawTime,
        maxTimeDisplay: displayTime,
        promptText: `Session ${s} - Question ${q} (Prompt #${globalOrder})`,
      });
    }
  }

  return questions;
}

/**
 * Generates default session intros for all 7 sessions.
 */
export function generateBlueSessionIntros(): BlueSessionIntro[] {
  const sessionConfigs = [
    { sessionNumber: 1, title: 'Session 1: Marker', narrationText: 'Session 1 – Marker – M.C.T 1.86 seconds (aka CHUNKS CONSTANT)' },
    { sessionNumber: 2, title: 'Session 2: Chair', narrationText: 'Session 2 – Chair – M.C.T 3.5 seconds' },
    { sessionNumber: 3, title: 'Session 3: Magnet', narrationText: 'Session 3 – Magnet – M.C.T 6.4 seconds' },
    { sessionNumber: 4, title: 'Session 4: Cup', narrationText: 'Session 4 – Cup – M.C.T 12 seconds' },
    { sessionNumber: 5, title: 'Session 5: Photo', narrationText: 'Session 5 – Photo – M.C.T 22.3 seconds' },
    { sessionNumber: 6, title: 'Session 6: Book', narrationText: 'Session 6 – Book – M.C.T 41.4 seconds' },
    { sessionNumber: 7, title: 'Session 7: Person', narrationText: 'Session 7 – Person – M.C.T 77 seconds (aka CHUNKS GATE)' },
  ];

  return sessionConfigs.map((cfg) => ({
    sessionNumber: cfg.sessionNumber,
    title: cfg.title,
    narrationText: cfg.narrationText,
  }));
}

/**
 * Generates the complete default Blue Test Package.
 */
export function generateDefaultBluePackage(): BlueTestPackage {
  return {
    id: 'blue-pkg-v1',
    name: 'Standard 7-Session Blue Test Package',
    version: '1.0.0',
    packageIntroText: `CHUNKS Test No. 3

Welcome to CHUNKS Test No. 3, also known as the Blue Test or Observation Test. This assessment is developed by CHUNKS based on CHUNKS Theory and will take place in the official Blue Room. The session will be recorded for review and analysis. The test uses Vietnamese and English appropriately to assess real-time visual–audial observation and intuitive Motion–Sound–Emotion response.

This test is designed for a registered native Vietnamese speaker using Vietnamese as L1 and English as L2. It lasts approximately 45 minutes and includes 49 challenges across 7 progressive sessions. Seven tools—a marker, chair, magnet, cup, photo, book, and person—will be introduced one by one to create an evolving CHUNKS scene involving a Captain and a Crew.

The Blue Test is completely memory-free. It does not assess the participant’s ability to memorize earlier actions, sounds, instructions, or idea details. CCI and CVR are not the primary variables because physical intensity and language resistance are not the focus. The central variable is Conscious Time: the length of time for which the participant can remain completely conscious within one uninterrupted flow of observation and response. The longer this conscious flow is maintained, the higher the participant’s Observation level, represented as %i.

During every challenge, the Crew must remain calm, observe the Captain’s present Motion–Sound–Emotion input, and respond immediately and intuitively. The Captain must not overspeed, cover the eyes, or block his own ears. The delay between the Captain’s action and the Crew’s response must remain within one second. Illogical MSE responses are allowed because no imposed logic or prepared response should control the conscious flow. However, any missed present-moment input, delayed response, incorrect movement or sound, repeated mistake, or broken rule will activate the ring and interrupt the flow.

Performance will be recorded on the Average Conscious Time (ACT) chart rather than a CPD chart. The official 7-color assessment system is still used: cold-color results increase the Rules Awareness Coefficient, %RAC, represented in this test as %i; hot-color results increase %RFC and indicate breaks in conscious flow. The participant’s ACT and color distribution across all 49 challenges determine the final %i result.`,
    packageEndText: `This is the end of CHUNKS Test No. 3. After the test, the test taker will receive the result verbally from the CiC. A digital copy of the official result, including the test taker’s ID picture, will be sent directly to the registered email address within 24 hours.
Thank you for completing the Blue Test with us.`,
    sessionIntros: generateBlueSessionIntros(),
    questions: generateBlueTestQuestions(),
  };
}

/**
 * Predicts which challenge C_m the participant stopped/failed at based on elapsed seconds t
 * within total duration T for a question with totalChallenges k.
 *
 * Interval for C_i: [(i-1)*T/k, i*T/k]
 * Returns m (1..k) indicating C_m is the failed/stopped challenge,
 * or returns k + 1 if all C1..Ck challenges passed (t >= T * 0.98).
 */
export function predictChallengeIndexFromElapsed(
  elapsedSeconds: number,
  maxTimeSecondsRaw: number,
  totalChallenges: number
): number {
  if (totalChallenges <= 0) return 1;
  if (elapsedSeconds >= maxTimeSecondsRaw * 0.98) {
    return totalChallenges + 1; // All C1..Ck passed
  }
  if (elapsedSeconds <= 0) {
    return 1; // Stopped at first challenge C1
  }
  const timePerChallenge = maxTimeSecondsRaw / totalChallenges;
  const calculatedIndex = Math.floor(elapsedSeconds / timePerChallenge) + 1;
  return Math.min(totalChallenges, Math.max(1, calculatedIndex));
}
