import type { Button, InputBlock, PlainTextElement, SectionBlock } from "@slack/types";

export const plain = (text: string): PlainTextElement => ({ type: "plain_text", text });
export const section = (text: string): SectionBlock => ({ type: "section", text: { type: "mrkdwn", text } });
export const button = (text: string, action_id: string, value: string): Button => ({ type: "button", text: plain(text), action_id, value });
export const input = (block_id: string, label: string, element: InputBlock["element"], optional = false): InputBlock =>
  ({ type: "input", block_id, label: plain(label), element, optional });
export const escape = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const shortDate = (date: string): string => date.split("-").reverse().join(".");
export const number = (value: number): string => new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(value);
