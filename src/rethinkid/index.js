import router from "../router";

const baseURL = process.env.NODE_ENV === "production" ? window.location.origin : "http://localhost:8080";

const config = {
    rethinkIdBaseUri: "https://id.rethinkdb.cloud",
    appId: "7925ef52-d263-4f24-be9a-bbff1e824e8e",
    signUpRedirectUri: baseURL,
    logInRedirectUri: `${baseURL}/callback`,
    onLogInComplete: () => {
        router.push({ name: "home" });
        window.location.reload();
    },
};

// `RethinkID` is imported via a script tag in index.html
export const rid = new RethinkID(config);
