export const getBaseUrl = (): string => {
  if (typeof window === "undefined") {
    return "http://localhost:8080";
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  const { hostname, protocol } = window.location;
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    const httpProto = protocol === "https:" ? "https:" : "http:";
    return `${httpProto}//${hostname}:8080`;
  }
  return "http://localhost:8080";
};

export const getBaseWsUrl = (): string => {
  return getBaseUrl().replace(/^http/, "ws");
};

/**
 * Resolves standard hardcoded urls to the dynamic base URL.
 */
export function resolveApiUrl(url: string): string {
  if (url.startsWith("http://localhost:8080")) {
    return url.replace("http://localhost:8080", getBaseUrl());
  }
  return url;
}

export function resolveWsUrl(url: string): string {
  if (url.startsWith("ws://localhost:8080")) {
    return url.replace("ws://localhost:8080", getBaseWsUrl());
  }
  return url;
}

export const apiClient = {
  fetch: (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let resolvedInput = input;
    if (typeof input === "string") {
      resolvedInput = resolveApiUrl(input);
    }
    return fetch(resolvedInput, init);
  },
};
