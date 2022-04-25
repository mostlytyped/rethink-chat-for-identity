import router from "../router";

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

// `RethinkID` is imported via a script tag in index.html
export const rid = new RethinkID(config);
