const baseURL = window.location.origin;

const config = {
    appId: "6d85d59f-d167-4724-acbb-39090821593e",
    signUpRedirectUri: baseURL,
    logInRedirectUri: `${baseURL}/callback`,
    dataAPIConnectErrorCallback: function (errorMessage) {
        this.logOut();
    },
};

// `RethinkID` is imported via a script tag in index.html
export const rid = new RethinkID(config);
