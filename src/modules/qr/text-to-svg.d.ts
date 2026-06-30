declare module 'text-to-svg' {
  type TextAnchor =
    | 'left baseline'
    | 'center baseline'
    | 'right baseline'
    | 'left top'
    | 'center top'
    | 'right top'
    | 'left middle'
    | 'center middle'
    | 'right middle'
    | 'left bottom'
    | 'center bottom'
    | 'right bottom';

  type TextToSvgOptions = {
    x?: number;
    y?: number;
    fontSize?: number;
    kerning?: boolean;
    letterSpacing?: number;
    tracking?: number;
    anchor?: TextAnchor;
    attributes?: Record<string, string | number>;
  };

  type TextMetrics = {
    x: number;
    y: number;
    baseline: number;
    width: number;
    height: number;
    ascender: number;
    descender: number;
  };

  class TextToSVG {
    static loadSync(file: string): TextToSVG;
    getD(text: string, options?: TextToSvgOptions): string;
    getPath(text: string, options?: TextToSvgOptions): string;
    getSVG(text: string, options?: TextToSvgOptions): string;
    getMetrics(text: string, options?: TextToSvgOptions): TextMetrics;
  }

  export = TextToSVG;
}
