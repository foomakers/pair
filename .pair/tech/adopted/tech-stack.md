# Tech Stack

- TypeScript is adopted for all application logic and development.
- TypeScript v5.x is adopted for all application logic and development.
- Markdown is adopted for documentation and knowledge base files.
- Markdown (CommonMark, .md files) is adopted for documentation and knowledge base files.
- Bash is adopted for scripting and coordination of AI assistant processes.
- Bash v5.x is adopted for scripting and coordination of AI assistant processes.
- Supabase is adopted for database and vector storage in Retrieval-Augmented Generation (RAG) workflows.
- Supabase v2.x is adopted for database and vector storage in Retrieval-Augmented Generation (RAG) workflows.
- Ollama is adopted for local LLM model execution in RAG workflows.
- Ollama v0.1.34+ is adopted for local LLM model execution in RAG workflows.
- For RAG tokenization and embedding, the following Ollama models are adopted for efficiency:
  - `llama3` (recommended for general RAG tasks)
  - `phi3` (efficient for embedding and fast inference)
  - `mistral` (compact, efficient for tokenization)
- All components are self-hosted unless external services are required for LLM or vector database functionality.
- External services may be used for LLM models or vector database if required for RAG.
- Next.js v14.x is adopted for the user interface for RAG management.
- shadcn/ui v1.x is adopted as the visual framework for the application UI.

---

All technology choices must follow these adopted standards. For process and rationale, see [way-of-working.md](../../way-of-working.md).
