<a href="https://www.framelink.ai/?utm_source=github&utm_medium=referral&utm_campaign=readme" target="_blank" rel="noopener">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://www.framelink.ai/github/HeaderDark.png" />
    <img alt="Framelink" src="https://www.framelink.ai/github/HeaderLight.png" />
  </picture>
</a>

<div align="center">
  <h1>Framelink Figma MCP Server</h1>
  <p>
    🌐 Available in:
    <a href="README.ko.md">한국어 (Korean)</a> |
    <a href="README.ja.md">日本語 (Japanese)</a> |
    <a href="README.zh.md">中文 (Chinese)</a>
  </p>
  <h3>Give your coding agent access to your Figma data.<br/>Implement designs in any framework in one-shot.</h3>
  <a href="https://npmcharts.com/compare/figma-developer-mcp?interval=30">
    <img alt="weekly downloads" src="https://img.shields.io/npm/dm/figma-developer-mcp.svg">
  </a>
  <a href="https://github.com/GLips/Figma-Context-MCP/blob/main/LICENSE">
    <img alt="MIT License" src="https://img.shields.io/github/license/GLips/Figma-Context-MCP" />
  </a>
  <a href="https://framelink.ai/discord">
    <img alt="Discord" src="https://img.shields.io/discord/1352337336913887343?color=7389D8&label&logo=discord&logoColor=ffffff" />
  </a>
  <br />
  <a href="https://twitter.com/glipsman">
    <img alt="Twitter" src="https://img.shields.io/twitter/url?url=https%3A%2F%2Fx.com%2Fglipsman&label=%40glipsman" />
  </a>
</div>

<br/>

Give [Cursor](https://cursor.sh/) and other AI-powered coding tools access to your Figma files with this [Model Context Protocol](https://modelcontextprotocol.io/introduction) server.

When Cursor has access to Figma design data, it's **way** better at one-shotting designs accurately than alternative approaches like pasting screenshots.

<h3><a href="https://www.framelink.ai/docs/quickstart?utm_source=github&utm_medium=referral&utm_campaign=readme">See quickstart instructions →</a></h3>

## ✨ Enhanced Version Features

This enhanced version includes significant improvements for handling large Figma files:

- **Universal Pattern Detection**: Works with any Figma file regardless of language or naming conventions - no more hardcoded logic!
- **Smart Duplicate Removal**: Automatically detects and removes duplicate content based on structural patterns, keeping only the first N examples (configurable)
- **Style Usage Optimization**: Tracks style usage and inlines styles used less than 3 times  
- **Intelligent Layout Filtering**: Keeps only visual-relevant properties, removing position/size data
- **Depth Control**: Limit processing depth to manage output size
- **New Depth Analysis Tool**: `analyze_figma_depth` - Analyze your Figma file structure to determine optimal depth settings, with file size and token count estimation
- **API-level Optimization**: Uses Figma API depth parameter for faster downloads
- **Generic Layer Optimization**: Automatically removes unnecessary single-child wrapper nodes

### New Configuration Options (Python version)
- `--duplicate-threshold N`: Control how many duplicate examples to keep (default: 3)
- `--no-table-detection`: Disable automatic table structure detection
- `--no-skip-intermediate`: Disable skipping of intermediate wrapper nodes

These optimizations can reduce JSON output size by **40-90%** while preserving all essential design information.

## Demo

[Watch a demo of building a UI in Cursor with Figma design data](https://youtu.be/6G9yb-LrEqg)

[![Watch the video](https://img.youtube.com/vi/6G9yb-LrEqg/maxresdefault.jpg)](https://youtu.be/6G9yb-LrEqg)

## How it works

1. Open your IDE's chat (e.g. agent mode in Cursor).
2. Paste a link to a Figma file, frame, or group.
3. Ask Cursor to do something with the Figma file—e.g. implement the design.
4. Cursor will fetch the relevant metadata from Figma and use it to write your code.

This MCP server is specifically designed for use with Cursor. Before responding with context from the [Figma API](https://www.figma.com/developers/api), it simplifies and translates the response so only the most relevant layout and styling information is provided to the model.

Reducing the amount of context provided to the model helps make the AI more accurate and the responses more relevant.

## Getting Started

Many code editors and other AI clients use a configuration file to manage MCP servers.

The `figma-developer-mcp` server can be configured by adding the following to your configuration file.

> NOTE: You will need to create a Figma access token to use this server. Instructions on how to create a Figma API access token can be found [here](https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens).

### MacOS / Linux

```json
{
  "mcpServers": {
    "Framelink Figma MCP": {
      "command": "npx",
      "args": ["-y", "@yulin0629/figma-developer-mcp", "--figma-api-key=YOUR-KEY", "--stdio"]
    }
  }
}
```

### Windows

```json
{
  "mcpServers": {
    "Framelink Figma MCP": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@yulin0629/figma-developer-mcp", "--figma-api-key=YOUR-KEY", "--stdio"]
    }
  }
}
```

Or you can set `FIGMA_API_KEY` and `PORT` in the `env` field.

If you need more information on how to configure the Framelink Figma MCP server, see the [Framelink docs](https://www.framelink.ai/docs/quickstart?utm_source=github&utm_medium=referral&utm_campaign=readme).

## Star History

<a href="https://star-history.com/#GLips/Figma-Context-MCP"><img src="https://api.star-history.com/svg?repos=GLips/Figma-Context-MCP&type=Date" alt="Star History Chart" width="600" /></a>

## Learn More

The Framelink Figma MCP server is simple but powerful. Get the most out of it by learning more at the [Framelink](https://framelink.ai?utm_source=github&utm_medium=referral&utm_campaign=readme) site.

<!-- SPONSORS:LIST:START -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->

## Sponsors

### 🥇 Gold Sponsors

<table>
  <tr>
   <td align="center"><a href="https://framelink.ai/?ref=framelink-mcp&utm_source=github&utm_medium=referral&utm_campaign=framelink-mcp"><img src="https://avatars.githubusercontent.com/u/204619719" width="180" alt="Framelink"/><br />Framelink</a></td>
  </tr>
</table>

### 🥈 Silver Sponsors

<table>
  <tr>
   <!-- <td align="center"><a href=""><img src="" width="150" alt="tbd"/><br />Title</a></td> -->
  </tr>
</table>

### 🥉 Bronze Sponsors

<table>
  <tr>
   <!-- <td align="center"><a href=""><img src="" width="120" alt="tbd"/><br />tbd</a></td>-->
  </tr>
</table>

### 😻 Smaller Backers

<table>
  <tr>
   <!-- <td align="center"><a href=""><img src="" width="100" alt="tbd"/><br />tbd</a></td>-->
  </tr>
  <tr>
   <!-- <td align="center"><a href=""><img src="" width="100" alt="tbd"/><br />tbd</a></td>-->
  </tr>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- SPONSORS:LIST:END -->
