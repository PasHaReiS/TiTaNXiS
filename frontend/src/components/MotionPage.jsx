import React from "react";
import { motion } from "framer-motion";

/**
 * Reusable page-transition wrapper.
 * Fades in + slides up 12px on mount, fades + slides down on unmount.
 * Wrap every top-level route page in <MotionPage>...</MotionPage>.
 */
const variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export default function MotionPage({ children, className = "" }) {
  return (
    <motion.div
      className={className}
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Stagger container — apply to a list root to cascade its motion.div children. */
export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};

/** Individual list-item variants — pair with staggerContainer on the parent. */
export const listItem = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
};

/** Modal/panel entrance — scale + fade. */
export const modalVariants = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, scale: 0.94, transition: { duration: 0.18 } },
};
