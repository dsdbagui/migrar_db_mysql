import { addRoute, navigate, startRouter } from "./router.js";
import { renderConnectionProfiles } from "./screens/connectionProfiles.js";
import { renderStep1 } from "./screens/wizard/step1.js";
import { renderStep2 } from "./screens/wizard/step2.js";
import { renderStep3 } from "./screens/wizard/step3.js";
import { renderStep4 } from "./screens/wizard/step4Preview.js";
import { renderJobStatus } from "./screens/jobStatus.js";
import { renderJobResult } from "./screens/jobResult.js";
import { renderJobHistory } from "./screens/jobHistory.js";
import { renderLogin } from "./screens/login.js";
import { renderChangePassword } from "./screens/changePassword.js";
import { api } from "./api.js";
import { resetWizard } from "./state/wizardState.js";

const app = document.getElementById("app")!;

// Rota pública — as demais dependem de sessão; um 401 em qualquer chamada redireciona para cá (api.ts).
addRoute("/login", () => renderLogin(app));
addRoute("/account/password", () => renderChangePassword(app));
addRoute("/profiles", () => renderConnectionProfiles(app));
addRoute("/wizard/step1", () => renderStep1(app));
addRoute("/wizard/step2", () => renderStep2(app));
addRoute("/wizard/step3", () => renderStep3(app));
addRoute("/wizard/step4", () => renderStep4(app));
addRoute("/jobs", () => renderJobHistory(app));
addRoute("/jobs/:feature/:id", (params) => renderJobStatus(app, { feature: params.feature!, id: params.id! }));
addRoute("/jobs/:feature/:id/result", (params) => renderJobResult(app, { feature: params.feature!, id: params.id! }));

// "Sair" na <nav> estática de index.html: encerra a sessão no backend (o cookie httpOnly só pode
// ser limpo por ele) e descarta o wizard em andamento antes de voltar para o login.
document.getElementById("logout-link")!.addEventListener("click", async (event) => {
  event.preventDefault();
  await api.logout();
  resetWizard();
  navigate("/login");
});

startRouter();
