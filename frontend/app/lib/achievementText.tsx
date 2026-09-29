import type { ReactElement } from "react";

/** Achievement descriptions: Markdown links and the names from the goal
 * become links (the achievements page and the profile use the same text). */

type DescriptionNode = string | ReactElement;

function parseMarkdownForNode(
  node: DescriptionNode,
  nodeIdx: number,
): DescriptionNode[] {
  if (typeof node !== "string") {
    return [node];
  }
  const finalNodes: DescriptionNode[] = [];
  let lastIndex = 0;
  while (lastIndex < node.length) {
    const link = findNextLink(node, lastIndex);
    if (!link) {
      finalNodes.push(node.substring(lastIndex));
      break;
    }

    if (link.startBracket > lastIndex) {
      finalNodes.push(node.substring(lastIndex, link.startBracket));
    }

    finalNodes.push(
      <a
        key={`md-${nodeIdx}-${link.startBracket}`}
        href={link.linkUrl}
        target="_blank"
        rel="noopener noreferrer"

        className="text-accent hover:underline"
      >
        {link.linkText}
      </a>,
    );

    lastIndex = link.endParenthesis + 1;
  }

  return finalNodes;
}

interface ParsedLink {
  startBracket: number;
  endBracket: number;
  endParenthesis: number;
  linkText: string;
  linkUrl: string;
}

function findNextLink(node: string, lastIndex: number): ParsedLink | null {
  let searchStart = lastIndex;
  while (true) {
    const startBracket = node.indexOf("[", searchStart);
    if (startBracket === -1) {
      return null;
    }

    const endBracket = node.indexOf("]", startBracket);
    if (endBracket === -1) {
      return null;
    }

    if (endBracket + 1 < node.length && node[endBracket + 1] === "(") {
      const endParenthesis = node.indexOf(")", endBracket + 2);
      if (endParenthesis !== -1) {
        return {
          startBracket,
          endBracket,
          endParenthesis,
          linkText: node.substring(startBracket + 1, endBracket),
          linkUrl: node.substring(endBracket + 2, endParenthesis),
        };
      }
    }

    searchStart = startBracket + 1;
  }
}

export function renderDescriptionWithLinks(
  desc: string,
  meta: string | null,
  url: string | null,
  name: string,
) {
  // 1. Markdown links [text](url) first: highlighting a name from the goal
  // inside one ("[Проводник](…)") would break its syntax
  let nodes: DescriptionNode[] = parseMarkdownForNode(desc, 0);

  const fallbackMeta = !meta || meta === "None" ? name : meta;
  const rawUrl = url?.includes("||") ? url.split("||")[1] : url;
  const linkUrl = rawUrl?.startsWith("http")
    ? rawUrl
    : `https://music.yandex.ru/search?text=${encodeURIComponent(fallbackMeta)}`;

  // 2. Then the names from the goal, in the remaining plain text
  const parts = fallbackMeta.split(/[-—]/).map((s) => s.trim());

  parts.forEach((targetWord, idx) => {
    if (!targetWord) return;
    const lowerTarget = targetWord.toLowerCase();

    const newNodes: DescriptionNode[] = [];
    nodes.forEach((node, nodeIdx) => {
      if (typeof node !== "string") {
        newNodes.push(node);
        return;
      }
      const lowerNode = node.toLowerCase();
      let lastIdx = 0;
      let idxOf = lowerNode.indexOf(lowerTarget, lastIdx);
      if (idxOf === -1) {
        newNodes.push(node);
        return;
      }
      while (idxOf !== -1) {
        if (idxOf > lastIdx) {
          newNodes.push(node.substring(lastIdx, idxOf));
        }
        const matchedWord = node.substring(idxOf, idxOf + targetWord.length);
        newNodes.push(
          <a
            key={`meta-${idx}-${nodeIdx}-${idxOf}`}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"

            className="text-accent hover:underline"
          >
            {matchedWord}
          </a>,
        );
        lastIdx = idxOf + targetWord.length;
        idxOf = lowerNode.indexOf(lowerTarget, lastIdx);
      }
      if (lastIdx < node.length) {
        newNodes.push(node.substring(lastIdx));
      }
    });
    nodes = newNodes;
  });

  return nodes;
}
