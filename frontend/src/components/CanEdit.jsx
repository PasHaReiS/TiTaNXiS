import React from "react";
import { useAuth } from "@/context/AuthContext";

export default function CanEdit({ children, fallback = null }) {
  const { canEdit } = useAuth();
  return canEdit ? children : fallback;
}

export function IsAdmin({ children, fallback = null }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : fallback;
}

export function AuthOnly({ children, fallback = null }) {
  const { user } = useAuth();
  return user ? children : fallback;
}
