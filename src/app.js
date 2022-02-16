import ClientOAuth2 from "client-oauth2";
import jwt_decode from "jwt-decode";

import socket from "./socket";

const oauthClient = new ClientOAuth2({
    clientId: process.env.VUE_APP_OAUTH_CLIENT_ID,
    accessTokenUri: process.env.VUE_APP_OAUTH_TOKEN_URI,
    authorizationUri: process.env.VUE_APP_OAUTH_AUTH_URI,
    redirectUri: process.env.VUE_APP_OAUTH_REDIRECT_URI,
    scopes: ["openid", "profile", "email"],
});

const ROOM_TABLE_NAMESPACE = "room";
const GUEST_ROOMS_TABLE_NAMES = "guest_rooms";

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

const ChatItem = Vue.component("chat-item", {
    props: ["chat", "roomTableName"],
    data() {
        return {
            updateChatFormIsVisible: false,
        };
    },
    methods: {
        deleteChat() {
            const payload = { tableName: this.roomTableName, rowId: this.chat.id, userId: this.$route.params.userId };
            socket.emit("table:delete", payload, (response) => {
                console.log("table:delete response", response);
            });
        },
        updateChat() {
            const payload = { tableName: this.roomTableName, row: this.chat, userId: this.$route.params.userId };
            socket.emit("table:update", payload, (response) => {
                console.log("table:update response", response);
                this.updateChatFormIsVisible = false;
            });
        },
        replaceChat() {
            const payload = { tableName: this.roomTableName, row: this.chat, userId: this.$route.params.userId };
            socket.emit("table:replace", payload, (response) => {
                console.log("table:replace response", response);
                this.updateChatFormIsVisible = false;
            });
        },
        toggleUpdateChat() {
            this.updateChatFormIsVisible = !this.updateChatFormIsVisible;
        },
    },
    template: `
<li>
    <span class="timestamp">
        {{ new Date(chat.ts).toLocaleString(undefined, {dateStyle: 'short', timeStyle: 'short'}) }}
    </span>
    <span class="user">{{ chat.username }}:</span>
    <span class="msg">
        <template v-if="updateChatFormIsVisible">
            <input type="text" v-model="chat.msg" />
            <button type="submit" @click="updateChat()">Update</button>
            <button type="submit" @click="replaceChat()">Replace</button>
        </template>
        <template v-else>
            {{ chat.msg }}
        </template>
    </span>
    <span class="chat-buttons">
        <button @click="toggleUpdateChat()">Update</button>
        <button @click="deleteChat()">Delete</button>
    </span>
</li>
    `,
});

const ChatRoom = Vue.component("chat-room", {
    props: ["userId", "roomId", "idTokenDecoded"],
    data() {
        return {
            chats: [],
            message: "",
            initialPermission: {
                userId: "",
                insert: false,
                read: false,
                update: false,
                delete: false,
            },
            permissions: [],
            hasAccess: true,
            socketRoomHandle: "", // <table user id>_<table name>
        };
    },
    created() {
        this.addUser();
        this.fetchPermissions();
        this.subscribe();
        this.fetchChats();
    },
    beforeDestroy() {
        // Not sure if this does anything useful
        socket.off(this.socketRoomHandle);

        console.log("unsubscribe from table");
        socket.emit(
            "table:unsubscribe",
            { tableName: this.roomTableName, userId: this.$route.params.userId },
            (response) => {
                console.log("table:unsubscribe response", response);
            },
        );
    },
    computed: {
        roomTableName: function () {
            return `${ROOM_TABLE_NAMESPACE}_${this.roomId}`;
        },
        isOwner: function () {
            return this.idTokenDecoded.sub === this.$route.params.userId;
        },
    },
    methods: {
        manageGuestRooms() {
            const row = { roomId: this.roomId, userId: this.userId };

            const readPayload = { tableName: GUEST_ROOMS_TABLE_NAMES };
            socket.emit("table:read", readPayload, (response) => {
                let guestRoomExists = false;

                // if there is no error, a guest rooms table exists, so search
                // for a matching room
                if (!response.error) {
                    const guestRooms = response.data;
                    guestRoomExists = guestRooms.some((g) => g.roomId === this.roomId && g.userId === this.userId);
                }

                // If response.error, table doesn't exist, insert
                // or if table exists and room doesn't exist, insert
                if (!guestRoomExists) {
                    const insertPayload = { tableName: GUEST_ROOMS_TABLE_NAMES, row };
                    socket.emit("table:insert", insertPayload, (response) => {
                        console.log("guestRoomExists table:insert response", response);
                    });
                }
            });
        },
        fetchChats() {
            const payload = { tableName: this.roomTableName, userId: this.userId };
            socket.emit("table:read", payload, (response) => {
                if (response.error) {
                    this.hasAccess = false;
                    return;
                }

                // user has access to this table
                if (!this.isOwner) {
                    this.manageGuestRooms();
                }

                const { data } = response;

                data.sort(function (a, b) {
                    if (a.ts > b.ts) return -1;
                    if (a.ts < b.ts) return 1;
                    return 0;
                });

                this.chats = data;
            });
        },
        subscribe() {
            const payload = { tableName: this.roomTableName, userId: this.$route.params.userId };
            socket.emit("table:subscribe", payload, (response) => {
                console.log("response subscribe", response);
                if (response.error) {
                    console.log("subscribe error", response.error);
                } else {
                    const socketTableHandle = response.data;

                    if (socketTableHandle) {
                        this.socketRoomHandle = socketTableHandle;

                        socket.on(this.socketRoomHandle, (changes) => {
                            console.log("Received emitted changes", changes);

                            if (changes.new_val && changes.old_val === null) {
                                console.log("Received new message");
                                this.chats.unshift(changes.new_val);
                            }
                            if (changes.new_val === null && changes.old_val) {
                                console.log("Received deleted message");
                                // delete message
                                const index = this.chats.findIndex((c) => c.id === changes.old_val.id);
                                if (index > -1) {
                                    this.chats.splice(index, 1);
                                }
                            }
                            if (changes.new_val && changes.old_val) {
                                console.log("Received updated message");
                                // update
                                const index = this.chats.findIndex((c) => c.id === changes.new_val.id);
                                if (index > -1) {
                                    Vue.set(this.chats, index, changes.new_val);
                                }
                            }
                        });
                    }
                }
            });
        },
        fetchPermissions() {
            if (!this.isOwner) {
                return;
            }

            const payload = { tableName: this.roomTableName };
            socket.emit("permissions:get", payload, (response) => {
                /**
                 * A form permission object
                 * @typedef {Object} FormPermission
                 * @property {string} id
                 * @property {string} userId
                 * @property {boolean} read
                 * @property {boolean} insert
                 * @property {boolean} update
                 * @property {boolean} delete
                 */
                const formPermissions = [];
                const userIds = [];
                if (!response.error) {
                    for (const permission of response.data) {
                        if (!userIds.includes(permission.userId)) {
                            userIds.push(permission.userId);
                            const formPermission = {
                                userId: permission.userId,
                                read: false,
                                insert: false,
                                update: false,
                                delete: false,
                                readId: "",
                                insertId: "",
                                updateId: "",
                                deleteId: "",
                            };

                            if (permission.permission === "read") {
                                formPermission.read = true;
                                formPermission.readId = permission.id;
                            }
                            if (permission.permission === "insert") {
                                formPermission.insert = true;
                                formPermission.insertId = permission.id;
                            }
                            if (permission.permission === "update") {
                                formPermission.update = true;
                                formPermission.updateId = permission.id;
                            }
                            if (permission.permission === "delete") {
                                formPermission.delete = true;
                                formPermission.deleteId = permission.id;
                            }

                            formPermissions.push(formPermission);
                        } else {
                            const index = formPermissions.findIndex((p) => p.userId === permission.userId);
                            formPermissions[index][permission.permission] = true;
                            formPermissions[index][`${permission.permission}Id`] = permission.id;
                        }
                    }
                    this.permissions = formPermissions;
                }
            });
        },
        sendMessage() {
            const message = {
                ts: Date.now(),
                msg: this.message,
                userId: this.idTokenDecoded.sub,
                username: this.idTokenDecoded.name,
                roomId: this.roomId,
            };

            const payload = { tableName: this.roomTableName, row: message, userId: this.userId };
            console.log("insert payload", payload);
            socket.emit("table:insert", payload, (response) => {
                console.log("insert response", response);
                if (!response.error) {
                    this.message = "";
                }
            });
        },
        setPermissions() {
            // Do not include empty permissions
            const permissions = this.permissions.filter((permission) => permission.userId !== "");

            const payload = [];
            const permissionTypes = ["read", "insert", "update", "delete"];

            /**
             * A backend permission object
             * @typedef {Object} Permission
             * @property {string} id
             * @property {string} tableName
             * @property {string} userId
             * @property {string} permission - 'read', 'insert', 'update', 'delete'
             */

            for (const permission of permissions) {
                for (const type of permissionTypes) {
                    if (permission[type]) {
                        payload.push({
                            id: permission[`${type}Id`],
                            tableName: this.roomTableName,
                            userId: permission.userId,
                            permission: type,
                        });
                    } else if (permission[`${type}Id`]) {
                        // a type that exists in the DB, because it has an ID, but is now false and needs to be deleted
                        socket.emit("permissions:delete", { rowId: permission[`${type}Id`] }, (response) => {
                            if (response.error) {
                                console.log("permissions:delete response.error", response.error);
                            }
                            if (response.message) {
                                console.log("permissions:delete response.message", response.message);
                            }
                        });
                    }
                }
            }

            console.log("set permissions for payload", payload);

            socket.emit("permissions:set", payload, (response) => {
                if (!response.error) {
                    this.fetchPermissions();
                }
            });
        },
        addUser() {
            this.permissions.push(Object.assign({}, this.initialPermission));
        },
    },
    template: `
<div class="chat-room">
    <div class="chat-ui">
        <ul id="chat-log">
            <chat-item v-for="chat in chats" :key="chat.id" :chat="chat" :roomTableName="roomTableName"></chat-item>
        </ul>
        <form class="message-form" v-on:submit.prevent="sendMessage">
            <input v-model="message" autocomplete="off" />
            <button>Send</button>
        </form>
    </div>
    <div class="chat-permissions">
        <template v-if="isOwner">
            <h3>Permissions</h3>
            <form v-on:submit.prevent="setPermissions">
                <div class="permission-group" v-for="(p, index) of permissions" :key="index">
                    <input type="text" v-model="permissions[index].userId" placeholder="User ID" />
                    
                    <div>
                        <input type="checkbox" :id="'permissions-' + index + '-read'" value="true" v-model="permissions[index].read">
                        <label :for="'permissions-' + index + '-read'">Read</label>
                    </div>
                    <div>
                        <input type="checkbox" :id="'permissions-' + index + '-insert'" value="true" v-model="permissions[index].insert">
                        <label :for="'permissions-' + index + '-insert'">Insert</label>
                    </div>
                    <div>
                        <input type="checkbox" :id="'permissions-' + index + '-update'" value="true" v-model="permissions[index].update">
                        <label :for="'permissions-' + index + '-update'">Update</label>
                    </div>
                    <div>
                        <input type="checkbox" :id="'permissions-' + index + '-delete'" value="true" v-model="permissions[index].delete">
                        <label :for="'permissions-' + index + '-delete'">Delete</label>
                    </div>
                    <input type="hidden" v-model="permissions[index].readId" />
                    <input type="hidden" v-model="permissions[index].updateId" />
                    <input type="hidden" v-model="permissions[index].insertId" />
                    <input type="hidden" v-model="permissions[index].deleteId" />
                </div>
                <button>Update</button>
            </form>
            <div><button @click="addUser">Add user</button></div>
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
            guestRooms: [],
        };
    },
    async created() {
        socket.emit("tables:list", null, (response) => {
            if (!response.error) {
                this.tableNames = response.data;
            }
        });
        const payload = { tableName: GUEST_ROOMS_TABLE_NAMES };
        socket.emit("table:read", payload, (response) => {
            if (!response.error) {
                this.guestRooms = response.data;
            }
        });
    },
    computed: {
        roomIds: function () {
            const prefix = `${ROOM_TABLE_NAMESPACE}_`;
            return this.tableNames
                .filter((tableName) => tableName.startsWith(prefix))
                .map((name) => name.replace(prefix, ""));
        },
    },
    methods: {
        async createAndGoToRoom() {
            const tableName = `${ROOM_TABLE_NAMESPACE}_${this.room}`;

            const payload = { tableName };

            socket.emit("tables:create", payload, (response) => {
                console.log("tables:create response", response);
                if (!response.error) {
                    this.$router.push({ name: "room", params: { userId: this.idTokenDecoded.sub, roomId: this.room } });
                }
            });
        },
        deleteRoom(roomId) {
            const tableName = `${ROOM_TABLE_NAMESPACE}_${roomId}`;
            socket.emit("tables:drop", { tableName }, (response) => {
                console.log("drop table response", response);
                this.tableNames = this.tableNames.filter((name) => {
                    return name !== tableName;
                });
            });
        },
    },
    template: `
<div class="main">
    <div v-if="roomIds.length > 0" class="card">
        <h2>My Rooms</h2>
        <ul class="rooms-list">
            <li v-for="(roomId, index) of roomIds" :key="index">
                <router-link :to="{ name: 'room', params: { userId: idTokenDecoded.sub, roomId: roomId }}">{{ roomId }}</router-link>
                <button type="button" @click="deleteRoom(roomId)">Delete room</button>
            </li>
        </ul>
    </div>
    <div v-if="guestRooms.length > 0" class="card">
        <h2>My Guest Rooms</h2>
        <ul class="rooms-list">
            <li v-for="(room, index) of guestRooms" :key="index">
                <router-link :to="{ name: 'room', params: { userId: room.userId, roomId: room.roomId }}">{{ room.roomId }}({{ room.userId }})</router-link>
            </li>
        </ul>
    </div>
    <form class="card" v-on:submit.prevent="createAndGoToRoom">
        <h2>Create Room</h2>
        <label>Room name: <input v-model="room" type="text" /></label>
        <button type="submit">Create and Join Room</button>
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
            jwt_decode(token);
            jwt_decode(idToken);

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
