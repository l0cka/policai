export declare function configureVendoredTreeSitterWorkspaceDir(workspaceDir: string): void;
type VendoredTreeSitterLoadResult = {
    available: true;
    module: unknown;
} | {
    available: false;
    reason: string;
};
/**
 * A load failure with a present vendor directory propagates: that is a
 * packaging regression in an artifact that claims to ship the natives.
 */
export declare function loadVendoredTreeSitterModule(options: {
    packageName: "tree-sitter" | "tree-sitter-bash";
    nativeRequire: (id: string) => unknown;
}): VendoredTreeSitterLoadResult;
export declare function createUnavailableParserClass(reason: string): unknown;
export {};
//# sourceMappingURL=vendored-tree-sitter.d.ts.map