// Re-export registry functions
export {
  registerParameterType,
  getParameterGenerator,
  isParameterTypeRegistered,
  registeredParameterTypes,
} from "./registry.js";

// Import parameter type modules here to trigger registration.
// Each module calls registerParameterType() at import time.
import "./gx-integer.js";
import "./gx-float.js";
import "./gx-boolean.js";
import "./gx-text.js";
import "./gx-color.js";
import "./gx-hidden.js";
import "./gx-select.js";
import "./gx-directory-uri.js";
import "./gx-genomebuild.js";
import "./gx-baseurl.js";
