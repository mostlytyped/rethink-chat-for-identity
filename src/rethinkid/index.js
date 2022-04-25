import router from "../router";

import { RethinkID } from "@mostlytyped/rethinkid-js-sdk";

const config = {
    rethinkIdBaseUri: "https://id.rethinkdb.cloud",
    appId: "<your-app-id>",
    signUpRedirectUri: "http://localhost:8080",
    logInRedirectUri: "http://localhost:8080/callback",
    onLogInComplete: () => {
        router.push({ name: "home" });
        window.location.reload();
    },
};
export const rid = new RethinkID(config);
