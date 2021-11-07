let username = Math.random().toString(36).substring(2, 8);

import ClientOAuth2 from "client-oauth2";
import jwt_decode from "jwt-decode";

const oauthClient = new ClientOAuth2({
    clientId: process.env.VUE_APP_OAUTH_CLIENT_ID,
    accessTokenUri: process.env.VUE_APP_OAUTH_TOKEN_URI,
    authorizationUri: process.env.VUE_APP_OAUTH_AUTH_URI,
    redirectUri: process.env.VUE_APP_OAUTH_REDIRECT_URI,
    scopes: ["openid", "name", "email"],
});

const App = Vue.component("app", {
    computed: {
        loggedIn: function () {
            return localStorage.getItem("token");
        },
    },
    methods: {
        signOut() {
            console.log("sign out");
            localStorage.removeItem("token");
            localStorage.removeItem("idToken");

            // a `beforeEach` global navigation guard in the router handles redirection
            location.reload();
        },
    },
    template: `
<div class="app">
    <div class="header">
        <div class="header-brand">
            <router-link :to="{ name: 'home' }">Rethink Chat</router-link>
        </div>
        <div>
            <ul class="header-menu">
                <li v-if="loggedIn"><button @click="signOut">Sign out</button></li>
                <li v-else><router-link :to="{ name: 'logged-out' }">Sign in/up</router-link></li>
            </ul>
        </div>
    </div>
    <router-view />
</div>`,
});

const ChatRoom = Vue.component("chat-room", {
    props: ["roomId"],
    data() {
        return {
            chats: [],
            message: "",
            username: username,
            handle: null,
        };
    },
    async created() {
        const url = new URL(document.location.protocol + "//" + document.location.host + "/db/chats");
        url.searchParams.append("orderBy", "ts");
        url.searchParams.append("order", "desc");
        url.searchParams.append("roomId", this.roomId);
        console.log("url", url);
        const chatsResp = await fetch(url, {
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
        });
        console.log("chatsResp", chatsResp);
        const { data, handle } = await chatsResp.json();
        this.chats = data;
        this.handle = handle;
        socket.on(this.handle, (msg) => {
            this.chats.unshift(msg);
        });
    },
    beforeDestroy() {
        socket.off(this.handle);
    },
    methods: {
        sendMessage() {
            socket.emit("chats", { msg: this.message, user: this.username, roomId: this.roomId });
            this.message = "";
        },
    },
    template: `
<div class="chatroom">
    <ul id="chatlog">
        <li v-for="chat in chats">
            <span class="timestamp">
                {{ new Date(chat.ts).toLocaleString(undefined, {dateStyle: 'short', timeStyle: 'short'}) }}
            </span>
            <span class="user">{{ chat.user }}:</span>
            <span class="msg">{{ chat.msg }}</span>
        </li>
    </ul>
    <label id="username">Username:
        {{ username }}
    </label>
    <form v-on:submit.prevent="sendMessage">
        <input v-model="message" autocomplete="off" />
        <button>Send</button>
    </form>
</div>
    `,
});

const RoomView = Vue.component("room-view", {
    template: `<chat-room :roomId="$route.params.roomId"/>`,
});

const MainView = Vue.component("main-view", {
    data() {
        return {
            room: "lobby",
            user: username,
        };
    },
    methods: {
        gotoRoom() {
            username = this.user;
            this.$router.push({ name: "room", params: { roomId: this.room } });
        },
    },
    template: `
<div class="main">
    <form class="main" v-on:submit.prevent="gotoRoom">
    <label>Username: <input v-model="user" type="text" /></label>
    <label>Room: <input v-model="room" type="text" /></label>
    <button>Join</button>
    </form>
</div>
    `,
});

const LoggedOutView = Vue.component("logged-out-view", {
    data() {
        return {
            signInUrl: "",
        };
    },
    async created() {
        // Create and store a random "state" value
        const state = this.generateRandomString();
        localStorage.setItem("pkce_state", state);

        // Create and store a new PKCE code_verifier (the plaintext random secret)
        const codeVerifier = this.generateRandomString();
        localStorage.setItem("pkce_code_verifier", codeVerifier);

        // Hash and base64-urlencode the secret to use as the challenge
        const codeChallenge = await this.pkceChallengeFromVerifier(codeVerifier);

        this.signInUrl = oauthClient.code.getUri({
            state: state,
            query: {
                code_challenge: codeChallenge,
                code_challenge_method: "S256",
            },
        });
    },
    computed: {
        signUpUrl: function () {
            const params = new URLSearchParams();
            params.append("redirect_uri", process.env.VUE_APP_DATA_SIGN_UP_REDIRECT_URI);
            return `${process.env.VUE_APP_DATA_SIGN_UP_URL}?${params.toString()}`;
        },
    },
    methods: {
        generateRandomString() {
            const array = new Uint32Array(28);
            window.crypto.getRandomValues(array);
            return Array.from(array, (dec) => ("0" + dec.toString(16)).substr(-2)).join("");
        },
        async pkceChallengeFromVerifier(codeVerifier) {
            const hashed = await this.sha256(codeVerifier);
            return this.base64urlencode(hashed);
        },
        sha256(plain) {
            const encoder = new TextEncoder();
            const data = encoder.encode(plain);
            return window.crypto.subtle.digest("SHA-256", data);
        },
        base64urlencode(arrayBuffer) {
            // Convert the ArrayBuffer to string using Uint8 array to convert to what btoa accepts.
            // btoa accepts chars only within ascii 0-255 and base64 encodes them.
            // Then convert the base64 encoded to base64url encoded
            //   (replace + with -, replace / with _, trim trailing =)
            // TODO btoa is deprecated
            return btoa(String.fromCharCode.apply(null, new Uint8Array(arrayBuffer)))
                .replace(/\+/g, "-")
                .replace(/\//g, "_")
                .replace(/=+$/, "");
        },
    },
    template: `
<div>
    <h1>You are logged out</h1>
    <div>
        <a :href="signInUrl">Sign in!</a>
    </div>
    <div>
        <a :href="signUpUrl">Sign up</a>
    </div>
</div>`,
});

const CallbackView = Vue.component("callback-view", {
    data() {
        return {
            error: "",
            errorDescription: "",
        };
    },
    async created() {
        const params = new URLSearchParams(window.location.search);

        // Check if the auth server returned an error string
        const error = params.get("error");
        if (error) {
            this.error = error;
            this.errorDescription = params.get("error_description");
            return;
        }

        // Make sure the auth server returned a code
        const code = params.get("code");
        if (!code) {
            this.error = "No query param code";
            return;
        }

        // Verify state matches what we set at the beginning
        if (localStorage.getItem("pkce_state") !== params.get("state")) {
            this.error = "State did not match. Possible CSRF attack";
        }

        let getTokenResponse;
        try {
            getTokenResponse = await oauthClient.code.getToken(window.location.href, {
                body: {
                    code_verifier: localStorage.getItem("pkce_code_verifier") || "",
                },
            });
            console.log("getTokenResponse", getTokenResponse);
        } catch (error) {
            console.log("error", error);
        }

        if (!getTokenResponse) {
            this.error = "could not get token response";
            return;
        }

        // Clean these up since we don't need them anymore
        localStorage.removeItem("pkce_state");
        localStorage.removeItem("pkce_code_verifier");

        // Store tokens and sign user in locally
        const token = getTokenResponse.data.access_token;
        const idToken = getTokenResponse.data.id_token;

        localStorage.setItem("token", token);
        localStorage.setItem("idToken", idToken);

        try {
            const tokenDecoded = jwt_decode(token);
            const idTokenDecoded = jwt_decode(idToken);
            console.log("idTokenDecoded", idTokenDecoded);
            console.log("tokenDecoded", tokenDecoded);

            // await this.$store.dispatch("autoSignIn", idTokenDecoded);
            // this.$store.dispatch("fetchUser");

            this.$router.push({ name: "home" });
        } catch (error) {
            console.log("token decode error:", error);
        }
    },
    template: `
<div>
    <h1>Oauth Callback</h1>
    <div v-if="error">
      <h2>{{ error }}</h2>
      <p>{{ errorDescription }}</p>
    </div>
</div>`,
});

const routes = [
    { path: "/", name: "home", component: MainView },
    { path: "/room/:roomId", name: "room", component: RoomView },
    { path: "/logged-out", name: "logged-out", component: LoggedOutView, meta: { requiresAuth: false } },
    { path: "/callback", name: "callback", component: CallbackView, meta: { requiresAuth: false } },
];
const router = new VueRouter({
    mode: "history",
    routes,
});

router.beforeEach((to, from, next) => {
    // If route requires auth
    if (to.matched.some((record) => record.meta.requiresAuth !== false)) {
        if (!localStorage.getItem("token")) {
            // Redirect to the sign in view if no token found and route requires auth
            next({ name: "logged-out" });
            return;
        }
    }

    next();
});

var socket = io();

new Vue({
    router,
    render: (h) => h(App),
}).$mount("#app");
