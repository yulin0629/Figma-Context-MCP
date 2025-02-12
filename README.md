# Figma MCP Server

A Model Context Protocol server that connects to Figma and provides functions for accessing Figma files and nodes within the file.

## Prerequisites

- Node.js v20.17.0
- PNPM package manager
- Figma API access token

## Installation

1. Clone the repository
2. Install dependencies:

```bash
pnpm install
```

3. Copy `.env.example` to `.env` and fill in your Figma API access token:

```bash
cp .env.example .env
```

## Development

Start the development server:

```bash
pnpm dev
```

## Available Tools

The server provides the following MCP tools:

### get-file

Fetches information about a Figma file.

Parameters:

- `fileKey` (string): The key of the Figma file to fetch
- `depth` (number, optional): How many levels deep to traverse the node tree

### get-node

Fetches information about a specific node within a Figma file.

Parameters:

- `fileKey` (string): The key of the Figma file containing the node
- `nodeId` (string): The ID of the node to fetch
- `depth` (number, optional): How many levels deep to traverse the node tree

## Scripts

- `pnpm build` - Build the project
- `pnpm start` - Start the production server
- `pnpm dev` - Start the development server
- `pnpm lint` - Run ESLint
- `pnpm format` - Format code with Prettier
- `pnpm test` - Run tests

## License

MIT
