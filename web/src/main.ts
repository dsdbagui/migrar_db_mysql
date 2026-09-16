import { addRoute, startRouter } from "./router.js";
import { renderConnectionProfiles } from "./screens/connectionProfiles.js";
import { renderStep1 } from "./screens/wizard/step1.js";
import { renderStep2 } from "./screens/wizard/step2.js";
import { renderStep3 } from "./screens/wizard/step3.js";
import { renderStep4 } from "./screens/wizard/step4Preview.js";
import { renderJobStatus } from "./screens/jobStatus.js";
import { renderJobResult } from "./screens/jobResult.js";

const app = document.getElementById("app")!;

addRoute("/profiles", () => renderConnectionProfiles(app));
addRoute("/wizard/step1", () => renderStep1(app));
addRoute("/wizard/step2", () => renderStep2(app));
addRoute("/wizard/step3", () => renderStep3(app));
addRoute("/wizard/step4", () => renderStep4(app));
addRoute("/jobs/:feature/:id", (params) => renderJobStatus(app, { feature: params.feature!, id: params.id! }));
addRoute("/jobs/:feature/:id/result", (params) => renderJobResult(app, { feature: params.feature!, id: params.id! }));

startRouter();
