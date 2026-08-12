import React from "react";
import { motion } from "framer-motion";

/**
 * Drop-in replacement for <button> with a subtle scale + gold glow on hover
 * and a spring bounce on tap. Forwards all native props.
 */
const MotionButton = React.forwardRef(function MotionButton(
  { children, className = "", disabled, style, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      className={className}
      disabled={disabled}
      style={style}
      whileHover={
        disabled
          ? undefined
          : {
              scale: 1.03,
              boxShadow: "0 0 22px rgba(245,166,35,0.55), 0 0 6px rgba(245,166,35,0.35)",
            }
      }
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 380, damping: 22, mass: 0.6 }}
      {...rest}
    >
      {children}
    </motion.button>
  );
});

export default MotionButton;
