import { toMarkdown } from "../../shared/mappers/htmlToMarkdown";
import axios from "axios";

export async function parseURLs(text: string): Promise<string[] | null> {
    const linkRegex =
        /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;
    const links: string[] | null = linkRegex.exec(text);
    let markdows: string[] | null = null;

    if (links) {
        const result = links.map(async (link) => {
            const response = await axios.get(link);

            if (response.status === 200 && response.data) return response.data;
        });

        markdows = toMarkdown(await Promise.all(result));
    }
    return markdows;
}
