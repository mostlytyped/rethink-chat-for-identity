const baseURL = window.location.origin;

const config = {
    appId: "6744e5ec-175d-472d-955c-e3225ce7bb29",
    signUpRedirectUri: baseURL,
    logInRedirectUri: `${baseURL}/callback`,
    dataAPIConnectErrorCallback: function (errorMessage) {
        this.logOut();
    },
};

// `RethinkID` is imported via a script tag in index.html
export const rid = new RethinkID(config);
