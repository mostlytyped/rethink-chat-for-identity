import router from "../router";

const baseURL = process.env.NODE_ENV === "production" ? window.location.origin : "http://localhost:8080";

const config = {
    rethinkIdBaseUri: "https://id.rethinkdb.cloud",
    appId: "6d85d59f-d167-4724-acbb-39090821593e",
    signUpRedirectUri: baseURL,
    logInRedirectUri: `${baseURL}/callback`,
    onLogInComplete: () => {
        router.push({ name: "home" });
        window.location.reload();
    },
};

// `RethinkID` is imported via a script tag in index.html
export const rid = new RethinkID(config);
