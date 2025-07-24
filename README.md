# ZhiMo Backend

Multi-agent AI-powered platform for processing and analyzing academic materials.

## Project Structure

```
src/
├── agents/                 # AI agent implementations
│   ├── analysis/          # Analysis agent for content analysis
│   ├── ingestion/         # Ingestion agent for file processing
│   ├── knowledge-extraction/ # Knowledge extraction agent
│   ├── orchestrator/      # Orchestrator agent for coordination
│   ├── pedagogy/          # Pedagogy agent for educational content
│   └── synthesis/         # Synthesis agent for notebook compilation
├── config/                # Configuration management
├── database/              # Database connections and management
├── middleware/            # Express middleware functions
├── types/                 # TypeScript type definitions
├── utils/                 # Utility functions
└── index.ts              # Main application entry point
```

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- MySQL database
- MongoDB database
- Redis server
- AWS S3 bucket (for file storage)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Configure your environment variables in `.env`

5. Build the project:
   ```bash
   npm run build
   ```

6. Start the development server:
   ```bash
   npm run dev
   ```

### Available Scripts

- `npm run build` - Build the TypeScript project
- `npm run start` - Start the production server
- `npm run dev` - Start the development server with hot reload
- `npm run dev:watch` - Start development server with file watching
- `npm run clean` - Clean the build directory
- `npm run type-check` - Run TypeScript type checking

### API Endpoints

- `GET /health` - Health check endpoint with database status

## Architecture

The system follows a multi-agent microservices architecture with:

- **Orchestrator Agent**: Coordinates all other agents
- **Ingestion Agent**: Processes uploaded files and extracts content
- **Analysis Agent**: Generates summaries, topics, and structural analysis
- **Knowledge Extraction Agent**: Extracts entities, definitions, and relationships
- **Pedagogy Agent**: Creates educational content like flashcards and questions
- **Synthesis Agent**: Compiles knowledge elements into study notebooks

## Database Schema

- **MySQL**: Stores documents, annotations, notebooks, and relational data
- **MongoDB**: Stores knowledge elements and flexible content data
- **Redis**: Handles caching and agent message queuing

## Development Status

This project is currently in development. The basic project structure and core dependencies have been set up. Individual agent implementations and API endpoints will be added in subsequent development phases.