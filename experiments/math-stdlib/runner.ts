/**
 * GSM8K Training Loop for Self-Extending Agent
 *
 * Tests whether running against math problems causes the agent to
 * create a library of math macros that improves performance over time.
 */

import { SajAgent, createAgent, type AgentResult } from "../self-extending-agent/agent.ts";
import { type Macro } from "../self-extending-agent/macros.ts";

export type GSM8KProblem = {
  question: string;
  answer: number;
  reasoning?: string;
};

export type TrainingMetrics = {
  totalProblems: number;
  correctAnswers: number;
  accuracy: number;
  macrosCreated: number;
  macrosUsed: number;
  macroReuseRate: number;
  accuracyOverTime: number[];
};

function extractNumber(result: unknown): number | null {
  if (typeof result === "number") return result;
  if (typeof result === "string") {
    const match = result.match(/-?\d+\.?\d*/);
    return match ? parseFloat(match[0]) : null;
  }
  return null;
}

function isCorrect(result: unknown, expected: number, tolerance = 0.01): boolean {
  const actual = extractNumber(result);
  if (actual === null) return false;
  return Math.abs(actual - expected) <= tolerance;
}

export type TrainingConfig = {
  agent: SajAgent;
  problems: GSM8KProblem[];
  onProblem?: (index: number, problem: GSM8KProblem, result: AgentResult, correct: boolean) => void;
  onMacroCreated?: (macro: string, problem: GSM8KProblem) => void;
  onCheckpoint?: (metrics: TrainingMetrics, macros: Macro[]) => void;
  checkpointEvery?: number;
  verbose?: boolean;
};

export async function trainOnGSM8K(config: TrainingConfig): Promise<TrainingMetrics> {
  const {
    agent,
    problems,
    onProblem,
    onMacroCreated,
    onCheckpoint,
    checkpointEvery = 100,
    verbose = false,
  } = config;

  const metrics: TrainingMetrics = {
    totalProblems: 0,
    correctAnswers: 0,
    accuracy: 0,
    macrosCreated: 0,
    macrosUsed: 0,
    macroReuseRate: 0,
    accuracyOverTime: [],
  };

  const recentCorrect: boolean[] = [];
  const macroUsageCounts: Record<string, number> = {};

  for (let i = 0; i < problems.length; i++) {
    const problem = problems[i];
    metrics.totalProblems++;

    if (verbose) {
      console.log(`\n[${i + 1}/${problems.length}] ${problem.question.substring(0, 50)}...`);
    }

    try {
      const result = await agent.execute({
        goal: `Solve this math problem and return ONLY the final numerical answer:\n\n${problem.question}`,
        context: "Return just the number, no explanation needed.",
      });

      const correct = isCorrect(result.result, problem.answer);

      if (correct) {
        metrics.correctAnswers++;
      }

      for (const macroName of result.macrosUsed) {
        macroUsageCounts[macroName] = (macroUsageCounts[macroName] || 0) + 1;
        metrics.macrosUsed++;
      }

      for (const macroName of result.macrosCreated) {
        metrics.macrosCreated++;
        onMacroCreated?.(macroName, problem);
      }

      recentCorrect.push(correct);
      if (recentCorrect.length > 100) {
        recentCorrect.shift();
      }
      const rollingAccuracy = recentCorrect.filter(Boolean).length / recentCorrect.length;
      metrics.accuracyOverTime.push(rollingAccuracy);

      metrics.accuracy = metrics.correctAnswers / metrics.totalProblems;
      metrics.macroReuseRate = metrics.macrosUsed > 0
        ? Object.values(macroUsageCounts).filter(c => c > 1).length / Object.keys(macroUsageCounts).length
        : 0;

      if (verbose) {
        console.log(`  Expected: ${problem.answer}, Got: ${result.result}, Correct: ${correct}`);
        console.log(`  Macros used: ${result.macrosUsed.join(", ") || "none"}`);
        console.log(`  Rolling accuracy: ${(rollingAccuracy * 100).toFixed(1)}%`);
      }

      onProblem?.(i, problem, result, correct);

      if ((i + 1) % checkpointEvery === 0) {
        const macros = await agent.listMacros();
        onCheckpoint?.(metrics, macros);
      }
    } catch (error) {
      if (verbose) {
        console.error(`  Error: ${(error as Error).message}`);
      }
      recentCorrect.push(false);
      if (recentCorrect.length > 100) recentCorrect.shift();
    }
  }

  return metrics;
}

export async function analyzeMacroQuality(
  agent: SajAgent,
  testProblems: GSM8KProblem[]
): Promise<Array<{ macro: Macro; accuracy: number; usageCount: number }>> {
  const macros = await agent.listMacros();
  const results: Array<{ macro: Macro; accuracy: number; usageCount: number }> = [];

  for (const macro of macros) {
    results.push({
      macro,
      accuracy: macro.successRate,
      usageCount: macro.usageCount,
    });
  }

  results.sort((a, b) => (b.usageCount * b.accuracy) - (a.usageCount * a.accuracy));

  return results;
}

export const SAMPLE_PROBLEMS: GSM8KProblem[] = [
  { question: "Janet has 3 apples. She buys 5 more apples. How many apples does she have now?", answer: 8 },
  { question: "A store has 24 oranges. If they sell 7 oranges, how many are left?", answer: 17 },
  { question: "Tom has 15 marbles. He gives 4 to his friend and then finds 6 more. How many marbles does Tom have?", answer: 17 },
  { question: "A rectangle has a length of 8 and a width of 5. What is its area?", answer: 40 },
  { question: "If you have $20 and spend $7.50, how much money do you have left?", answer: 12.5 },
  { question: "A baker makes 36 cookies and puts them equally into 4 boxes. How many cookies are in each box?", answer: 9 },
  { question: "Sarah scored 85, 90, and 95 on three tests. What is her average score?", answer: 90 },
  { question: "A shirt costs $25. If it's on sale for 20% off, how much do you save?", answer: 5 },
  { question: "John runs 3 miles every day for a week. How many miles does he run in total?", answer: 21 },
  { question: "A train travels at 60 miles per hour. How far does it travel in 2.5 hours?", answer: 150 },
  { question: "If 5 workers can build a wall in 10 days, how many days would it take 1 worker?", answer: 50 },
  { question: "A store increases prices by 15%. If an item was $40, what is the new price?", answer: 46 },
  { question: "The sum of two numbers is 100. One number is 3 times the other. What is the larger number?", answer: 75 },
  { question: "A tank is 1/4 full. After adding 30 liters, it becomes 3/4 full. What is the tank's capacity?", answer: 60 },
  { question: "If the perimeter of a square is 48, what is its area?", answer: 144 },
];

export async function runExperiment(config: {
  problems?: GSM8KProblem[];
  verbose?: boolean;
}): Promise<{
  metrics: TrainingMetrics;
  macros: Macro[];
  analysis: Array<{ macro: Macro; accuracy: number; usageCount: number }>;
}> {
  const problems = config.problems ?? SAMPLE_PROBLEMS;

  console.log("=".repeat(60));
  console.log("GSM8K Self-Extension Experiment");
  console.log("=".repeat(60));
  console.log(`Problems: ${problems.length}`);
  console.log("");

  const agent = createAgent({
    verbose: config.verbose ?? false,
    enableMacroCreation: true,
  });

  const metrics = await trainOnGSM8K({
    agent,
    problems,
    verbose: config.verbose ?? true,
    onMacroCreated: (name) => {
      console.log(`  Created macro: ${name}`);
    },
    onCheckpoint: (m, macros) => {
      console.log("\n--- Checkpoint ---");
      console.log(`Accuracy: ${(m.accuracy * 100).toFixed(1)}%`);
      console.log(`Macros: ${macros.length}`);
      console.log("");
    },
  });

  const macros = await agent.listMacros();
  const analysis = await analyzeMacroQuality(agent, problems);

  console.log("\n" + "=".repeat(60));
  console.log("Results");
  console.log("=".repeat(60));
  console.log(`Final Accuracy: ${(metrics.accuracy * 100).toFixed(1)}%`);
  console.log(`Macros Created: ${metrics.macrosCreated}`);
  console.log(`Total Macro Library: ${macros.length}`);
  console.log(`Macro Reuse Rate: ${(metrics.macroReuseRate * 100).toFixed(1)}%`);

  console.log("\nTop Macros by Value (usage x accuracy):");
  for (const item of analysis.slice(0, 10)) {
    console.log(`  ${item.macro.name}: ${item.usageCount} uses, ${(item.accuracy * 100).toFixed(0)}% success`);
  }

  return { metrics, macros, analysis };
}

if (import.meta.main) {
  await runExperiment({ verbose: true });
}
