const baseURL = window.location.origin;

const config = {
    appId: process.env.VUE_APP_APP_ID,
    logInRedirectUri: `${baseURL}/callback`,
    dataAPIConnectErrorCallback: function (errorMessage) {
        this.logOut();
    },
};

// `RethinkID` is imported via a script tag in index.html
export const rid = new RethinkID(config);
