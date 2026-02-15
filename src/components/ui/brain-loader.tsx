"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useState } from "react";
import brainIcon from "../../../brain_icon.png";

type BrainLoaderProps = {
  withDots?: boolean;
  subtle?: boolean;
  className?: string;
};

export function BrainLoader({
  withDots = false,
  subtle = false,
  className
}: BrainLoaderProps) {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    setIsLight(document.documentElement.getAttribute("data-ui-skin") === "light");
  }, []);

  const outerOpacity = subtle ? [0.18, 0.32, 0.18] : [0.35, 0.95, 0.35];
  const outerScale = subtle ? [1, 1, 1] : [0.88, 1.2, 0.88];
  const ringOpacity = subtle ? [0.2, 0.34, 0.2] : [0.25, 0.8, 0.25];
  const ringScale = subtle ? [1, 1, 1] : [1, 1.12, 1];
  const innerOpacity = subtle ? [0.14, 0.24, 0.14] : [0.2, 0.55, 0.2];
  const innerScale = subtle ? [1, 1, 1] : [0.96, 1.08, 0.96];
  const glowShadow = subtle
    ? [
        "0 0 0px rgba(56,189,248,0.16)",
        "0 0 8px rgba(56,189,248,0.24)",
        "0 0 0px rgba(56,189,248,0.16)"
      ]
    : [
        "0 0 0px rgba(56,189,248,0.35)",
        "0 0 28px rgba(56,189,248,0.8)",
        "0 0 0px rgba(56,189,248,0.35)"
      ];
  const duration = subtle ? 3.2 : 1.55;

  return (
    <div className={className}>
      <div className="inline-flex items-center gap-5 pl-1">
        <div className="relative flex h-14 w-14 items-center justify-center">
          <motion.div
            className={`absolute inset-0 rounded-full blur-[2px] ${
              isLight ? "bg-[rgb(var(--accent)/0.36)]" : "bg-cyan-300/35"
            }`}
            animate={{ opacity: outerOpacity, scale: outerScale }}
            transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className={`absolute inset-1 rounded-full border ${
              isLight
                ? "border-[rgb(var(--accent)/0.45)]"
                : "border-cyan-200/35"
            }`}
            animate={{ opacity: ringOpacity, scale: ringScale }}
            transition={{
              duration,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.08
            }}
          />
          <motion.div
            className={`absolute inset-2 rounded-full ${
              isLight ? "bg-[rgb(var(--accent)/0.18)]" : "bg-cyan-200/10"
            }`}
            animate={{ opacity: innerOpacity, scale: innerScale }}
            transition={{
              duration: subtle ? 2 : 1.4,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.12
            }}
          />
          <motion.div
            className="relative rounded-full p-2"
            animate={{ boxShadow: glowShadow }}
            transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
          >
            <Image
              src={brainIcon}
              alt=""
              aria-hidden="true"
              className={`h-10 w-10 object-contain opacity-100 ${
                isLight
                  ? "[filter:brightness(0)_invert(0.3)_sepia(1)_saturate(550%)_hue-rotate(165deg)_drop-shadow(0_0_14px_rgba(14,116,144,0.95))]"
                  : "[filter:brightness(0)_invert(1)_sepia(1)_saturate(520%)_hue-rotate(170deg)_drop-shadow(0_0_14px_rgba(125,211,252,1))]"
              }`}
            />
          </motion.div>
        </div>

        {withDots ? (
          <div className="flex items-end gap-2 pb-0.5">
            {[0, 1, 2, 3].map((index) => (
              <motion.span
                key={index}
                className={`rounded-full ${isLight ? "bg-[rgb(var(--accent)/0.9)]" : "bg-cyan-200/90"}`}
                style={{
                  width: `${6 + (index % 2)}px`,
                  height: `${6 + (index % 2)}px`
                }}
                animate={{
                  y: [3, -9 - index, 3],
                  x: [0, index % 2 === 0 ? 2 : -2, 0],
                  opacity: [0.2, 1, 0.2],
                  scale: [0.75, 1.05, 0.75]
                }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: index * 0.12,
                  ease: "easeInOut"
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
