"use client";

import { Volume2, VolumeX } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface VoiceToggleProps {
  enabled: boolean;
  supported: boolean;
  onChange: (enabled: boolean) => void;
}

export default function VoiceToggle({ enabled, supported, onChange }: VoiceToggleProps) {
  return (
    <label
      className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium shadow-xs"
      title={supported ? "উত্তর শুনুন" : "Voice output is not supported in this browser"}
    >
      {enabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4 text-muted-foreground" />}
      <span className="hidden sm:inline">ভয়েস</span>
      <Switch checked={enabled} onCheckedChange={onChange} disabled={!supported} aria-label="ভয়েস আউটপুট" />
      <span className="w-7 text-xs text-muted-foreground">{enabled ? "ON" : "OFF"}</span>
    </label>
  );
}
