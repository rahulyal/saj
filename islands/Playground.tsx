import { useSignal } from "@preact/signals";

// Example programs to show users
const EXAMPLES = [
  {
    name: "Simple Math",
    program: {
      type: "arithmeticOperation",
      operation: "+",
      operands: [
        { type: "number", value: 2 },
        { type: "number", value: 3 },
      ],
    },
  },
  {
    name: "Conditional",
    program: {
      type: "conditional",
      condition: {
        type: "comparativeOperation",
        operation: ">",
        operands: [
          { type: "number", value: 10 },
          { type: "number", value: 5 },
        ],
      },
      trueReturn: { type: "string", value: "ten is greater" },
      falseReturn: { type: "string", value: "five is greater" },
    },
  },
  {
    name: "Lambda & Call",
    program: {
      type: "procedureCall",
      procedure: {
        type: "procedure",
        inputs: ["x"],
        body: {
          type: "arithmeticOperation",
          operation: "*",
          operands: [
            { type: "variable", key: "x" },
            { type: "variable", key: "x" },
          ],
        },
      },
      arguments: [{ type: "number", value: 7 }],
    },
  },
  {
    name: "KV Store & Retrieve",
    program: {
      type: "effect",
      action: "sequence",
      steps: [
        {
          type: "effect",
          action: "kv:set",
          key: "counter",
          value: { type: "number", value: 42 },
        },
        {
          type: "effect",
          action: "kv:get",
          key: "counter",
        },
      ],
    },
  },
  {
    name: "Log Message",
    program: {
      type: "effect",
      action: "log",
      message: { type: "string", value: "Hello from SAJ!" },
    },
  },
];

export default function Playground() {
  const code = useSignal(JSON.stringify(EXAMPLES[0].program, null, 2));
  const prompt = useSignal("");
  const result = useSignal<string | null>(null);
  const error = useSignal<string | null>(null);
  const logs = useSignal<string[]>([]);
  const loading = useSignal(false);
  const generating = useSignal(false);
  const activeTab = useSignal<"editor" | "generate">("editor");

  const runProgram = async () => {
    loading.value = true;
    error.value = null;
    result.value = null;
    logs.value = [];

    try {
      const program = JSON.parse(code.value);
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program }),
      });

      const data = await response.json();

      if (!response.ok) {
        error.value = data.error + (data.message ? `: ${data.message}` : "");
        if (data.details) {
          error.value += "\n" + JSON.stringify(data.details, null, 2);
        }
      } else {
        result.value = JSON.stringify(data.result, null, 2);
        logs.value = data.logs || [];
      }
    } catch (e) {
      error.value = `Parse error: ${(e as Error).message}`;
    } finally {
      loading.value = false;
    }
  };

  const generateProgram = async () => {
    if (!prompt.value.trim()) return;

    generating.value = true;
    error.value = null;

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.value }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        error.value = data.error || "Generation failed";
        if (data.validationErrors) {
          error.value += "\n\nValidation errors:\n" + JSON.stringify(data.validationErrors, null, 2);
        }
        if (data.raw) {
          code.value = JSON.stringify(data.raw.program || data.raw, null, 2);
        }
      } else {
        code.value = JSON.stringify(data.program, null, 2);
        result.value = `Generated: ${data.description}`;
        activeTab.value = "editor";
      }
    } catch (e) {
      error.value = `Generation error: ${(e as Error).message}`;
    } finally {
      generating.value = false;
    }
  };

  const loadExample = (example: typeof EXAMPLES[0]) => {
    code.value = JSON.stringify(example.program, null, 2);
    error.value = null;
    result.value = null;
    logs.value = [];
  };

  return (
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Panel - Editor */}
      <div class="space-y-4">
        {/* Tabs */}
        <div class="flex gap-2 border-b border-gray-800 pb-2">
          <button
            onClick={() => (activeTab.value = "editor")}
            class={`px-4 py-2 rounded-t text-sm transition ${
              activeTab.value === "editor"
                ? "bg-gray-800 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Editor
          </button>
          <button
            onClick={() => (activeTab.value = "generate")}
            class={`px-4 py-2 rounded-t text-sm transition ${
              activeTab.value === "generate"
                ? "bg-gray-800 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Generate with LLM
          </button>
        </div>

        {activeTab.value === "editor" ? (
          <>
            {/* Examples */}
            <div class="flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example.name}
                  onClick={() => loadExample(example)}
                  class="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded transition"
                >
                  {example.name}
                </button>
              ))}
            </div>

            {/* Code Editor */}
            <div class="relative">
              <textarea
                value={code.value}
                onInput={(e) => (code.value = (e.target as HTMLTextAreaElement).value)}
                class="w-full h-96 bg-gray-900 border border-gray-800 rounded-lg p-4 font-mono text-sm text-green-400 focus:outline-none focus:border-blue-500 resize-none"
                spellcheck={false}
              />
            </div>

            {/* Run Button */}
            <button
              onClick={runProgram}
              disabled={loading.value}
              class="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-medium transition"
            >
              {loading.value ? "Running..." : "Run Program"}
            </button>
          </>
        ) : (
          <>
            {/* LLM Prompt */}
            <div class="space-y-3">
              <label class="block text-sm text-gray-400">
                Describe what you want the program to do:
              </label>
              <textarea
                value={prompt.value}
                onInput={(e) => (prompt.value = (e.target as HTMLTextAreaElement).value)}
                placeholder="e.g., Calculate the factorial of 5, or store my name in KV and retrieve it..."
                class="w-full h-32 bg-gray-900 border border-gray-800 rounded-lg p-4 font-mono text-sm text-white focus:outline-none focus:border-purple-500 resize-none"
              />
              <button
                onClick={generateProgram}
                disabled={generating.value || !prompt.value.trim()}
                class="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-medium transition"
              >
                {generating.value ? "Generating..." : "Generate SAJ Program"}
              </button>
            </div>

            <div class="text-sm text-gray-500">
              <p class="mb-2">Try prompts like:</p>
              <ul class="list-disc list-inside space-y-1 text-gray-400">
                <li>"Add 5 and 10 together"</li>
                <li>"Check if 100 is greater than 50"</li>
                <li>"Create a function that doubles a number and call it with 7"</li>
                <li>"Store the value 'hello world' in KV under key 'greeting'"</li>
                <li>"Fetch data from a JSON API"</li>
              </ul>
            </div>
          </>
        )}
      </div>

      {/* Right Panel - Output */}
      <div class="space-y-4">
        <h2 class="text-lg font-medium text-gray-300">Output</h2>

        {/* Logs */}
        {logs.value.length > 0 && (
          <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 class="text-sm text-gray-500 mb-2">Logs</h3>
            <div class="space-y-1 font-mono text-sm">
              {logs.value.map((log, i) => (
                <div key={i} class="text-yellow-400">
                  → {log}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Result */}
        {result.value && (
          <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 class="text-sm text-gray-500 mb-2">Result</h3>
            <pre class="font-mono text-sm text-green-400 whitespace-pre-wrap">
              {result.value}
            </pre>
          </div>
        )}

        {/* Error */}
        {error.value && (
          <div class="bg-red-950 border border-red-800 rounded-lg p-4">
            <h3 class="text-sm text-red-400 mb-2">Error</h3>
            <pre class="font-mono text-sm text-red-300 whitespace-pre-wrap">
              {error.value}
            </pre>
          </div>
        )}

        {/* Empty State */}
        {!result.value && !error.value && logs.value.length === 0 && (
          <div class="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center text-gray-500">
            Run a program to see the output here
          </div>
        )}

        {/* Schema Reference */}
        <details class="bg-gray-900 border border-gray-800 rounded-lg">
          <summary class="p-4 cursor-pointer text-gray-400 hover:text-white transition">
            SAJ Schema Reference
          </summary>
          <div class="px-4 pb-4 text-sm text-gray-400 space-y-2">
            <p><strong>Primitives:</strong> number, string, boolean</p>
            <p><strong>Operations:</strong> +, -, *, /, {">"}, {"<"}, =, {">=", "<=", "!="}</p>
            <p><strong>Control:</strong> conditional, procedure, procedureCall</p>
            <p><strong>Effects:</strong> kv:get, kv:set, kv:delete, kv:list, fetch, log, sequence, let</p>
          </div>
        </details>
      </div>
    </div>
  );
}
