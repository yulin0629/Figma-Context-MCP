# figma-developer-mcp

## 0.4.5

### Patch Changes

- Fixed repository and homepage URLs to point to correct GitHub repository: https://github.com/yulin0629/Figma-Context-MCP

## 0.4.4

### Major Changes

- **Generalized Duplicate Detection**: Replaced hardcoded Chinese-specific logic with universal pattern detection that works with any Figma file, regardless of language or naming conventions
- **Structure-based Table Detection**: Tables are now detected by analyzing repeating structural patterns rather than relying on specific node names
- **Configurable Processing Options**: Added command-line flags for fine-tuning the simplification process:
  - `--duplicate-threshold`: Control how many duplicate examples to keep (default: 3)
  - `--no-table-detection`: Disable automatic table structure detection
  - `--no-skip-intermediate`: Disable skipping of intermediate wrapper nodes

### Minor Changes

- **Smart Table Row Deduplication**: Automatically detects and removes duplicate content based on structural signatures, keeping only the first N examples (configurable) per table with independent counters
- **Style Usage Optimization**: Tracks style usage count and automatically inlines styles used less than 3 times to reduce output size
- **Intelligent Layout Filtering**: Filters layout properties to keep only visual-relevant ones (mode, justifyContent, alignItems, gap, padding), removing position/size data
- **Depth Control Support**: Added `maxDepth` parameter to limit processing depth both at API and client level
- **New Tool: analyze_figma_depth**: Analysis tool that shows node distribution at each depth level, provides smart recommendations for optimal depth settings, and includes file size and token count estimation
- **API-level Depth Optimization**: When depth is specified, uses Figma API's depth parameter with buffer (depth + 2, max 10) for faster downloads
- **Generic Intermediate Layer Skipping**: Automatically removes unnecessary single-child INSTANCE wrappers regardless of naming
- **TypeScript Type Improvements**: Added proper types for TableCounter, DEPTH_LIMIT nodes, and improved GlobalVars structure

### Performance Improvements

- JSON output size reduction of 40-90% depending on file complexity
- Faster downloads when using depth parameter due to API-level filtering
- More efficient style lookup using Map instead of Object
- Reduced memory usage by tracking and inlining low-usage styles

### Bug Fixes

- Fixed table row counting to be independent per table container
- Fixed depth limit to work correctly with both files and nodes endpoints
- Improved node signature generation for better deduplication accuracy

## 0.4.3

### Patch Changes

- [#179](https://github.com/GLips/Figma-Context-MCP/pull/179) [`17988a0`](https://github.com/GLips/Figma-Context-MCP/commit/17988a0b5543330c6b8f7f24baa33b65a0da7957) Thanks [@GLips](https://github.com/GLips)! - Update curl command in fetchWithRetry to include error handling options, ensure errors are actually caught properly and returned to users.

## 0.4.2

### Patch Changes

- [#170](https://github.com/GLips/Figma-Context-MCP/pull/170) [`d560252`](https://github.com/GLips/Figma-Context-MCP/commit/d56025286e8c3c24d75f170974c12f96d32fda8b) Thanks [@GLips](https://github.com/GLips)! - Add support for custom .env files.

## 0.4.1

### Patch Changes

- [#161](https://github.com/GLips/Figma-Context-MCP/pull/161) [`8d34c6c`](https://github.com/GLips/Figma-Context-MCP/commit/8d34c6c23df3b2be5d5366723aeefdc2cca0a904) Thanks [@YossiSaadi](https://github.com/YossiSaadi)! - Add --json CLI flag and OUTPUT_FORMAT env var to support JSON output format in addition to YAML.

## 0.4.0

### Minor Changes

- [#126](https://github.com/GLips/Figma-Context-MCP/pull/126) [`6e99226`](https://github.com/GLips/Figma-Context-MCP/commit/6e9922693dcff70b69be6b505e24062a89e821f0) Thanks [@habakan](https://github.com/habakan)! - Add SVG export options to control text outlining, id inclusion, and whether strokes should be simplified.

### Patch Changes

- [#153](https://github.com/GLips/Figma-Context-MCP/pull/153) [`4d58e83`](https://github.com/GLips/Figma-Context-MCP/commit/4d58e83d2e56e2bc1a4799475f29ffe2a18d6868) Thanks [@miraclehen](https://github.com/miraclehen)! - Refactor layout positioning logic and add pixel rounding.

- [#112](https://github.com/GLips/Figma-Context-MCP/pull/112) [`c48b802`](https://github.com/GLips/Figma-Context-MCP/commit/c48b802ff653cfc46fe6077a8dc96bd4a15edb40) Thanks [@dgxyzw](https://github.com/dgxyzw)! - Change format of component properties in simplified response.

- [#150](https://github.com/GLips/Figma-Context-MCP/pull/150) [`4a4318f`](https://github.com/GLips/Figma-Context-MCP/commit/4a4318faa6c2eb91a08e6cc2e41e3f9e2f499a41) Thanks [@GLips](https://github.com/GLips)! - Add curl fallback to make API requests more robust in corporate environments

- [#149](https://github.com/GLips/Figma-Context-MCP/pull/149) [`46550f9`](https://github.com/GLips/Figma-Context-MCP/commit/46550f91340969cf3683f4537aefc87d807f1b64) Thanks [@miraclehen](https://github.com/miraclehen)! - Resolve promise in image downloading function only after file is finished writing.

## 0.3.1

### Patch Changes

- [#133](https://github.com/GLips/Figma-Context-MCP/pull/133) [`983375d`](https://github.com/GLips/Figma-Context-MCP/commit/983375d3fe7f2c4b48ce770b13e5b8cb06b162d0) Thanks [@dgomez-orangeloops](https://github.com/dgomez-orangeloops)! - Auto-update package version in code.

## 0.3.0

### Minor Changes

- [#122](https://github.com/GLips/Figma-Context-MCP/pull/122) [`60c663e`](https://github.com/GLips/Figma-Context-MCP/commit/60c663e6a83886b03eb2cde7c60433439e2cedd0) Thanks [@YossiSaadi](https://github.com/YossiSaadi)! - Include component and component set names to help LLMs find pre-existing components in code

- [#109](https://github.com/GLips/Figma-Context-MCP/pull/109) [`64a1b10`](https://github.com/GLips/Figma-Context-MCP/commit/64a1b10fb62e4ccb5d456d4701ab1fac82084af3) Thanks [@jonmabe](https://github.com/jonmabe)! - Add OAuth token support using Authorization Bearer method for alternate Figma auth.

- [#128](https://github.com/GLips/Figma-Context-MCP/pull/128) [`3761a70`](https://github.com/GLips/Figma-Context-MCP/commit/3761a70db57b3f038335a5fb568c2ca5ff45ad21) Thanks [@miraclehen](https://github.com/miraclehen)! - Handle size calculations for non-AutoLayout elements and absolutely positioned elements.

### Patch Changes

- [#106](https://github.com/GLips/Figma-Context-MCP/pull/106) [`4237a53`](https://github.com/GLips/Figma-Context-MCP/commit/4237a5363f696dcf7abe046940180b6861bdcf22) Thanks [@saharis9988](https://github.com/saharis9988)! - Remove empty keys from simplified design output.

- [#119](https://github.com/GLips/Figma-Context-MCP/pull/119) [`d69d96f`](https://github.com/GLips/Figma-Context-MCP/commit/d69d96fd8a99c9b59111d9c89613a74c1ac7aa7d) Thanks [@cooliceman](https://github.com/cooliceman)! - Add scale support for PNG images pulled via download_figma_images tool.

- [#129](https://github.com/GLips/Figma-Context-MCP/pull/129) [`56f968c`](https://github.com/GLips/Figma-Context-MCP/commit/56f968cd944cbf3058f71f3285c363e895dcf91d) Thanks [@fightZy](https://github.com/fightZy)! - Make shadows on text nodes apply text-shadow rather than box-shadow

## 0.2.2

### Patch Changes

- fd10a46: - Update HTTP server creation method to no longer subclass McpServer
  - Change logging behavior on HTTP server
- 6e2c8f5: Minor bump, testing fix for hanging CF DOs

## 0.2.2-beta.1

### Patch Changes

- 6e2c8f5: Minor bump, testing fix for hanging CF DOs

## 0.2.2-beta.0

### Patch Changes

- fd10a46: - Update HTTP server creation method to no longer subclass McpServer
  - Change logging behavior on HTTP server
