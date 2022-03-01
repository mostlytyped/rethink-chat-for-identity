import { RethinkID } from "@mostlytyped/rethinkid-js-sdk";

const config = {
    appId: "ff1f3a69-115d-4383-acdc-495b266819da",
    signUpRedirectUri: "http://localhost:8080",
    logInRedirectUri: "http://localhost:8080/callback",
};

export const rid = new RethinkID(config);
