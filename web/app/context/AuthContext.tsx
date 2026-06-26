"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { decodeJwt } from "@/app/utils/helpers";

interface AuthContextProps {
  token: string | null;
  userRole: string;
  username: string;
  agentStatus: "connecting" | "online" | "offline";
  setAgentStatus: (status: "connecting" | "online" | "offline") => void;
  login: (tokenStr: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<"connecting" | "online" | "offline">("connecting");
  
  const userRole = token ? (decodeJwt(token)?.role || "viewer") : "viewer";
  const username = token ? (decodeJwt(token)?.sub || "") : "";

  // Check for existing token on mount
  useEffect(() => {
    const savedToken = localStorage.getItem("minicpanel_token");
    if (savedToken) {
      setTimeout(() => {
        setToken(savedToken);
      }, 0);
    } else {
      setTimeout(() => {
        setAgentStatus("offline");
      }, 0);
    }
  }, []);

  const login = useCallback((tokenStr: string) => {
    localStorage.setItem("minicpanel_token", tokenStr);
    setToken(tokenStr);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("minicpanel_token");
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        token,
        userRole,
        username,
        agentStatus,
        setAgentStatus,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
