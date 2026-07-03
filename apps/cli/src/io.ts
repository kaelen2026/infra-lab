import { createInterface } from "node:readline/promises";

/**
 * Terminal I/O boundary. Commands depend on this interface (not on
 * `console`/`stdin`) so tests drive them with an in-memory fake — the same DI
 * shape the rest of the monorepo uses to stay hermetic.
 */
export interface CliIO {
  print(message: string): void;
  error(message: string): void;
  /** Prompt on stdout and read one trimmed line from stdin. */
  prompt(question: string): Promise<string>;
}

/** Real stdio-backed {@link CliIO}. */
export function createStdioIO(): CliIO {
  return {
    print(message: string): void {
      process.stdout.write(`${message}\n`);
    },
    error(message: string): void {
      process.stderr.write(`${message}\n`);
    },
    async prompt(question: string): Promise<string> {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const answer = await rl.question(question);
        return answer.trim();
      } finally {
        rl.close();
      }
    },
  };
}
