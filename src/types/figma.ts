export interface FigmaError {
  status: number;
  err: string;
}

export interface FigmaAPIResponse {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  nodes: Record<
    string,
    {
      document: FigmaDocumentNode;
      // ignoring sub-objects like components, styles, etc.
    }
  >;
}

export interface FigmaDocumentNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaDocumentNode[];
  fills?: RawPaint[];
  strokes?: RawPaint[];
  absoluteBoundingBox?: RawBoundingBox;
  characters?: string;
  style?: RawTextStyle;
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL'; // from Figma
  itemSpacing?: number;
  layoutWrap?: 'NO_WRAP' | 'WRAP';
  counterAxisSizingMode?: 'FIXED' | 'AUTO';
  // plus any other layout-related fields in Figma
}

export interface RawPaint {
  type: 'SOLID' | 'IMAGE' | 'VARIABLE_ALIAS' | string;
  color?: RawColor;
  blendMode?: string;
  imageRef?: string;
  // ignoring boundVariables
}

export interface RawColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface RawBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RawTextStyle {
  fontFamily?: string;
  fontWeight?: number;
  fontSize?: number;
  lineHeightPx?: number;
  lineHeightPercent?: number;
  letterSpacing?: number;
  // ignoring everything else
}
