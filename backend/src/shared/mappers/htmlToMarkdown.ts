import { NodeHtmlMarkdown, type NodeHtmlMarkdownOptions } from "node-html-markdown";

export function toMarkdown(text: string[], options?: NodeHtmlMarkdownOptions): string[] {
    const md = new NodeHtmlMarkdown(options);
    let result: string[] = [];

    text.forEach((value) => {
        result.push(md.translate(value));
    });

    return result;
}
