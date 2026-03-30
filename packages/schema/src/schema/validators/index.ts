// Re-export registry functions
export {
  registerValidatorType,
  getValidatorApplier,
  isValidatorTypeRegistered,
  registeredValidatorTypes,
  applyValidators,
} from "./registry.js";

// Import validator modules to trigger registration.
import "./in-range.js";
import "./regex.js";
import "./length.js";
import "./expression.js";
import "./empty-field.js";
import "./no-options.js";
