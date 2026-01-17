import Playground from "../islands/Playground.tsx";

export default function Home() {
  return (
    <div class="min-h-screen flex flex-col">
      <header class="border-b border-gray-800 px-6 py-4">
        <div class="max-w-7xl mx-auto flex items-center justify-between">
          <div class="flex items-center gap-3">
            <h1 class="text-xl font-semibold text-white">SAJ</h1>
            <span class="text-gray-500 text-sm">Scheme As JSON</span>
          </div>
          <nav class="flex items-center gap-6 text-sm">
            <a href="/docs" class="text-gray-400 hover:text-white transition">
              Docs
            </a>
            <a
              href="https://github.com/rahulyal/saj"
              class="text-gray-400 hover:text-white transition"
              target="_blank"
            >
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <main class="flex-1 p-6">
        <div class="max-w-7xl mx-auto">
          <Playground />
        </div>
      </main>

      <footer class="border-t border-gray-800 px-6 py-4 text-center text-gray-500 text-sm">
        LLM-powered JSON programs with effects
      </footer>
    </div>
  );
}
