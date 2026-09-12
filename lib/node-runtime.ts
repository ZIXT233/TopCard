export const embeddedNodeExecutable = () => process.env.TOPCARD_NODE_EXECUTABLE || process.execPath;

export const withEmbeddedNodeEnvironment = (environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv => {
  const env = { ...environment };
  if (process.env.TOPCARD_NODE_RUN_AS_NODE === "1") env.ELECTRON_RUN_AS_NODE = "1";
  return env;
};

export const embeddedNodeShellPrefix = (): string =>
  process.env.TOPCARD_NODE_RUN_AS_NODE === "1" ? "env ELECTRON_RUN_AS_NODE=1 " : "";
