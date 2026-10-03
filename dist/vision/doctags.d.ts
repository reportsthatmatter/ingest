export type VisionBlockType = "heading" | "paragraph" | "list_item" | "footnote" | "furniture" | "other";
export type VisionBlock = {
    type: VisionBlockType;
    /** heading level (1 for title / section_header_level_1, ...) */
    level?: number;
    /** the tag the model used */
    tag: string;
    text: string;
    /** loc_ box (0-500 grid): left, top, right, bottom */
    box: [number, number, number, number] | null;
    /** footnote blocks: the label opening the note */
    label?: string;
    /** body blocks: markers found in `text` as [label, character offset of the label's digits] */
    markers: {
        label: string;
        offset: number;
    }[];
};
export declare function parseDoctags(doctags: string): VisionBlock[];
/** Footnote labels and body markers from the blocks' types: call again after a block is retyped. */
export declare function assignMarkers(blocks: VisionBlock[]): void;
/** Words of a block (letters and digits, folded), for alignment. */
export declare const blockWords: (text: string) => string[];
