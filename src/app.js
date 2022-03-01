import { rid } from "./rethinkid";

const ROOM_TABLE_NAMESPACE = "room";
const GUEST_ROOMS_TABLE_NAMES = "guest_rooms";

const App = Vue.component("app", {
    data() {
        return {
            loggedIn: false,
            idTokenDecoded: {
                sub: "",
                email: "",
            },
        };
    },
    created() {
        // Get user on page load
        const loggedIn = rid.isLoggedIn();
        if (loggedIn && loggedIn.idTokenDecoded) {
            this.idTokenDecoded = loggedIn.idTokenDecoded;
            this.loggedIn = true;
        }
    },
    methods: {
        signOut() {
            rid.logOut();
        },
        onReceivedIdToken(idTokenDecoded) {
            // Set on callback after sign in
            this.idTokenDecoded = idTokenDecoded;
            this.loggedIn = true;
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
                    <li><button @click="signOut">Sign out</button></li>
                </template>
                <template v-else>
                    <li><router-link :to="{ name: 'logged-out' }">Sign in/up</router-link></li>
                </template>
            </ul>
        </div>
    </div>
    <router-view :idTokenDecoded="idTokenDecoded"  v-on:received-id-token="onReceivedIdToken" />
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
        async deleteChat() {
            try {
                const response = await rid.tableDelete(this.roomTableName, this.chat.id, this.$route.params.userId);
                console.log("tableDelete response", response);
            } catch (e) {
                console.error("tableDelete error:", e.message);
            }
        },
        async updateChat() {
            try {
                const response = await rid.tableUpdate(this.roomTableName, this.chat, this.$route.params.userId);
                console.log("tableUpdate response", response);
                this.updateChatFormIsVisible = false;
            } catch (e) {
                console.error("tableUpdate error:", e.message);
            }
        },
        async replaceChat() {
            try {
                const response = await rid.tableReplace(this.roomTableName, this.chat, this.$route.params.userId);
                console.log("tableReplace response", response);
                this.updateChatFormIsVisible = false;
            } catch (e) {
                console.error("tableReplace error:", e.message);
            }
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
    async beforeDestroy() {
        // Not sure if this does anything useful
        rid.socket.off(this.socketRoomHandle);

        try {
            const response = await rid.tableUnsubscribe(this.roomTableName, this.$route.params.userId);
            console.log("tableUnsubscribe response", response);
        } catch (e) {
            console.error("tableUnsubscribe error:", e.message);
        }
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
        async manageGuestRooms() {
            const row = { roomId: this.roomId, userId: this.userId };

            try {
                const readResponse = await rid.tableRead(GUEST_ROOMS_TABLE_NAMES);

                const guestRooms = readResponse.data;
                let guestRoomExists = guestRooms.some((g) => g.roomId === this.roomId && g.userId === this.userId);

                if (!guestRoomExists) {
                    await rid.tableInsert(GUEST_ROOMS_TABLE_NAMES, row);
                }
            } catch (e) {
                console.error("manageGuestRooms tableRead error, so try to create+insert:", e.message);
                // Table probably doesn't exist, create and insert
                await rid.tableInsert(GUEST_ROOMS_TABLE_NAMES, row);
            }
        },
        async fetchChats() {
            try {
                const response = await rid.tableRead(this.roomTableName, this.userId);

                // user has access to this table
                if (!this.isOwner) {
                    this.manageGuestRooms();
                }

                const { data } = response;

                if (!data) return;

                data.sort(function (a, b) {
                    if (a.ts > b.ts) return -1;
                    if (a.ts < b.ts) return 1;
                    return 0;
                });

                this.chats = data;
            } catch (e) {
                console.error("fetchChats tableRead error:", e.message);
                this.hasAccess = false;
            }
        },
        async subscribe() {
            try {
                const response = await rid.tableSubscribe(this.roomTableName, this.$route.params.userId);

                const socketTableHandle = response.data;

                if (socketTableHandle) {
                    this.socketRoomHandle = socketTableHandle;

                    rid.socket.on(this.socketRoomHandle, (changes) => {
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
            } catch (e) {
                console.error("tableSubscribe", e.message);
            }
        },
        async fetchPermissions() {
            if (!this.isOwner) {
                console.log("is not owner, do not get permissions");
                return;
            }

            try {
                const response = await rid.permissionsGet(this.roomTableName);

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
            } catch (e) {
                console.error("permissionsGet error:", e.message);
            }
        },
        async sendMessage() {
            const message = {
                ts: Date.now(),
                msg: this.message,
                userId: this.idTokenDecoded.sub,
                username: this.idTokenDecoded.name,
                roomId: this.roomId,
            };

            try {
                const response = await rid.tableInsert(this.roomTableName, message, this.userId);
                console.log("sendMessage tableInsert response", response);
                this.message = "";
            } catch (e) {
                console.error("sendMessage tableInsert error:", e.message);
            }
        },
        async setPermissions() {
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
                        try {
                            const response = await rid.permissionsDelete(permission[`${type}Id`]);
                            console.log("permissionsDelete response.message", response.message);
                        } catch (e) {
                            console.error("permissionsDelete error", e.message);
                        }
                    }
                }
            }

            try {
                await rid.permissionsSet(payload);
                this.fetchPermissions();
            } catch (e) {
                console.error("permissionsSet error", e.message);
            }
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
        try {
            const response = await rid.tablesList();
            this.tableNames = response.data;
        } catch (e) {
            console.error("tablesList error:", e.message);
        }

        try {
            const response = await rid.tableRead(GUEST_ROOMS_TABLE_NAMES);
            this.guestRooms = response.data;
        } catch (e) {
            //
        }
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

            try {
                await rid.tablesCreate(tableName);
                this.$router.push({ name: "room", params: { userId: this.idTokenDecoded.sub, roomId: this.room } });
            } catch (e) {
                console.error("tablesCreate error:", e.message);
            }
        },
        async deleteRoom(roomId) {
            const tableName = `${ROOM_TABLE_NAMESPACE}_${roomId}`;

            const response = await rid.tablesDrop(tableName);

            console.log("drop table response", response);
            this.tableNames = this.tableNames.filter((name) => {
                return name !== tableName;
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
        this.signInUrl = await rid.logInUri();
    },
    computed: {
        signUpUrl: function () {
            return rid.signUpUri();
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
        const decodedTokens = await rid.getTokens();

        if (decodedTokens.error) {
            this.error = decodedTokens.error;
            this.errorDescription = decodedTokens.errorDescription || "";
            return;
        }

        // Emit to parent because most views depend on the ID token for user info
        // Set as data in parent so the app reacts.
        this.$emit("received-id-token", decodedTokens.idTokenDecoded);

        this.$router.push({ name: "home" });
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
