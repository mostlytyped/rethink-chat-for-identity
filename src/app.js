import ClientOAuth2 from "client-oauth2";
import jwt_decode from "jwt-decode";

import socket from "./socket";

const oauthClient = new ClientOAuth2({
    clientId: process.env.VUE_APP_OAUTH_CLIENT_ID,
    accessTokenUri: process.env.VUE_APP_OAUTH_TOKEN_URI,
    authorizationUri: process.env.VUE_APP_OAUTH_AUTH_URI,
    redirectUri: process.env.VUE_APP_OAUTH_REDIRECT_URI,
    scopes: ["openid", "name", "email"],
});

const ROOM_TABLE_NAMESPACE = "room_";

const App = Vue.component("app", {
    data() {
        return {
            idTokenDecoded: {},
        };
    },
    async created() {
        // Get user
        const idToken = localStorage.getItem("idToken");
        if (idToken) {
            try {
                this.idTokenDecoded = jwt_decode(idToken);
                console.log("idTokenDecoded", this.idTokenDecoded);
            } catch (error) {
                console.log("id token decode error:", error);
                localStorage.removeItem("idToken");
            }
        }
    },
    computed: {
        loggedIn: function () {
            // not reactive
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
                <template v-if="loggedIn">
                    <li>{{ idTokenDecoded.sub }}</li>
                    <li>{{ idTokenDecoded.email }}</li>
                    <li>{{ idTokenDecoded.name }}</li>
                    <li><button @click="signOut">Sign out</button></li>
                </template>
                <template v-else>
                    <li><router-link :to="{ name: 'logged-out' }">Sign in/up</router-link></li>
                </template>
            </ul>
        </div>
    </div>
    <router-view :idTokenDecoded="idTokenDecoded" />
</div>`,
});

const ChatRoom = Vue.component("chat-room", {
    props: ["userId", "roomId", "idTokenDecoded"],
    data() {
        return {
            chats: [],
            message: "",
            handle: null, // for socket.io
            userIdsWithPermission: [],
            userIdsWithPermissionStr: "",
            hasAccess: true,
        };
    },
    async created() {
        this.fetchChats();
        this.fetchPermissions();
    },
    computed: {
        roomTableName: function () {
            return `${ROOM_TABLE_NAMESPACE}${this.roomId}`;
        },
        isOwner: function () {
            return this.idTokenDecoded.sub === this.$route.params.userId;
        },
    },
    methods: {
        async fetchChats() {
            const payload = { tableName: this.roomTableName, tableUserId: this.userId };
            socket.emit("table:read", payload, (response) => {
                console.log("table:read:", response);
                if (response.error) {
                    this.hasAccess = false;
                    return;
                }
                const chats = response;

                chats.sort(function (a, b) {
                    if (a.ts > b.ts) return -1;
                    if (a.ts < b.ts) return 1;
                    return 0;
                });

                this.chats = chats;
            });
        },
        async fetchPermissions() {
            if (!this.isOwner) {
                return;
            }

            const payload = { userId: this.userId, tableName: this.roomTableName };
            socket.emit("table-permissions:read", payload, (response) => {
                if (!response.error) {
                    this.userIdsWithPermission = response;
                    this.userIdsWithPermissionStr = this.userIdsWithPermission.join(",");
                }
            });
        },
        async sendMessage() {
            const chat = {
                ts: Date.now(),
                msg: this.message,
                userId: this.idTokenDecoded.sub,
                username: this.idTokenDecoded.name,
                roomId: this.roomId,
            };

            const payload = { userId: this.userId, tableName: this.roomTableName, row: chat };
            socket.emit("table:row:create", payload, (response) => {
                if (!response.error) {
                    this.fetchChats();
                    this.message = "";
                }
            });
        },
        async updatePermissions() {
            const payload = {
                userId: this.userId,
                tableName: this.roomTableName,
                userIds: this.userIdsWithPermissionStr,
            };
            socket.emit("table-permissions:update", payload, (response) => {
                if (!response.error) {
                    this.fetchPermissions();
                }
            });
        },
    },
    template: `
<div class="chat-room">
    <div class="chat-ui">
        <ul id="chatlog">
            <li v-for="chat in chats">
                <span class="timestamp">
                    {{ new Date(chat.ts).toLocaleString(undefined, {dateStyle: 'short', timeStyle: 'short'}) }}
                </span>
                <span class="user">{{ chat.username }}:</span>
                <span class="msg">{{ chat.msg }}</span>
            </li>
        </ul>
        <form v-on:submit.prevent="sendMessage">
            <input v-model="message" autocomplete="off" />
            <button>Send</button>
        </form>
    </div>
    <div class="chat-permissions">
        <template v-if="isOwner">
            <h3>User IDs with Access</h3>
            <ul>
                <li v-for="(userId, index) of userIdsWithPermission" :key.id="index">
                    {{ userId }}
                </li>
            </ul>
            <form v-on:submit.prevent="updatePermissions">
                <input type="text" v-model="userIdsWithPermissionStr" />
                <button>Update</button>
            </form>
        </template>
        <template v-else>
            <p>You are a guest in this room.</p>
            <p v-if="!hasAccess">You do not have access to this room.</p>
        </template>
    </div>
</div>
    `,
});

const RoomView = Vue.component("room-view", {
    props: ["idTokenDecoded"],
    template: `<chat-room :userId="$route.params.userId" :roomId="$route.params.roomId" :idTokenDecoded="idTokenDecoded" />`,
});

const MainView = Vue.component("main-view", {
    props: ["idTokenDecoded"],
    data() {
        return {
            room: "lobby",
            tableNames: [],
            userIds: "",
        };
    },
    async created() {
        const payload = { userId: this.idTokenDecoded.sub };
        socket.emit("table-names:read", payload, (response) => {
            if (!response.error) {
                this.tableNames = response;
            }
        });
    },
    computed: {
        roomIds: function () {
            return this.tableNames
                .filter((tableName) => tableName.startsWith(ROOM_TABLE_NAMESPACE))
                .map((name) => name.replace(ROOM_TABLE_NAMESPACE, ""));
        },
    },
    methods: {
        async createAndGoToRoom() {
            const payload = {
                userId: this.idTokenDecoded.sub,
                tableName: `${ROOM_TABLE_NAMESPACE}${this.room}`,
                userIds: this.userIds,
            };
            socket.emit("table:create", payload, (response) => {
                this.$router.push({ name: "room", params: { userId: this.idTokenDecoded.sub, roomId: this.room } });
            });
        },
    },
    template: `
<div class="main">
    <h2>My Rooms</h2>
    <ul>
        <li v-for="(roomId, index) of roomIds" :key="index">
            <router-link :to="{ name: 'room', params: { userId: idTokenDecoded.sub, roomId: roomId }}">{{ roomId }}</router-link>
        </li>
    </ul>
    <form class="main" v-on:submit.prevent="createAndGoToRoom">
    <label>Room name: <input v-model="room" type="text" /></label>
    <label>Give access: <input v-model="userIds" type="text" placeholder="e.g. user-id-a,user-id-b" /></label>
    <button>Create and Join Room</button>
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

        socket.auth = {
            token: localStorage.getItem("token"),
        };

        try {
            const tokenDecoded = jwt_decode(token);
            const idTokenDecoded = jwt_decode(idToken);
            console.log("idTokenDecoded", idTokenDecoded);
            console.log("tokenDecoded", tokenDecoded);

            // await this.$store.dispatch("autoSignIn", idTokenDecoded);
            // this.$store.dispatch("fetchUser");

            this.$router.push({ name: "home" });
            location.reload();
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
    { path: "/:userId/room/:roomId", name: "room", component: RoomView },
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

new Vue({
    router,
    render: (h) => h(App),
}).$mount("#app");
