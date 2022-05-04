import { rid } from "./rethinkid";
import router from "./router";

import { ROOM_TABLE_NAMESPACE, GUEST_ROOMS_TABLE_NAME } from "./constants";

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

/**
 * A payload-ready permission object
 * @typedef {Object} PayloadPermission
 * @property {string} id
 * @property {string} tableName
 * @property {string} userId
 * @property {string} type - 'read', 'insert', 'update', 'delete'
 */

const App = Vue.component("app", {
    data() {
        return {
            loggedIn: false,
            user: {
                id: "",
                email: "",
            },
            logInUri: "",
        };
    },
    async created() {
        // Get user on page load
        const loggedIn = rid.isLoggedIn();
        if (loggedIn) {
            this.loggedIn = true;
            this.user = rid.userInfo();
        }

        this.logInUri = await rid.logInUri();
    },
    computed: {
        signUpUrl: function () {
            return rid.signUpUri();
        },
    },
    methods: {
        signOut() {
            rid.logOut();
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
                    <li class="user-info">
                        {{ user.email }}<br>
                        User ID: {{ user.id }}
                    </li>
                    <li><button class="button" @click="signOut">Sign out</button></li>
                </template>
                <template v-else>
                    <li>
                        <a class="button button-primary u-full-width" :href="logInUri">Log in</a>
                    </li>
                    <li>
                        <a class="button u-full-width" :href="signUpUrl">Sign up</a>
                    </li>
                </template>
            </ul>
        </div>
    </div>
    <router-view :user="user" />
</div>`,
});

Vue.component("chat-item", {
    props: ["chat", "roomTableName", "myUserId"],
    data() {
        return {
            updateChatFormIsVisible: false,
        };
    },
    computed: {
        roomTable: async function () {
            return await rid.table(this.roomTableName);
        },
        chatUserId: function () {
            return this.chat.userId === this.myUserId ? "Me" : this.chat.userId;
        },
    },
    methods: {
        async deleteChat() {
            try {
                const roomTable = await this.roomTable;
                const response = await roomTable.delete({
                    rowId: this.chat.id,
                    userId: this.$route.params.userId,
                });
                console.log("roomTable.delete response", response);
            } catch (e) {
                console.error("roomTable.delete error:", e.message);
            }
        },
        async updateChat() {
            try {
                const roomTable = await this.roomTable;
                const response = await roomTable.update(this.chat, {
                    userId: this.$route.params.userId,
                });
                console.log("roomTable.update response", response);
                this.updateChatFormIsVisible = false;
            } catch (e) {
                console.error("roomTable.update error:", e.message);
            }
        },
        async replaceChat() {
            try {
                const roomTable = await this.roomTable;
                const response = await roomTable.replace(this.chat, {
                    userId: this.$route.params.userId,
                });
                console.log("roomTable.replace response", response);
                this.updateChatFormIsVisible = false;
            } catch (e) {
                console.error("roomTable.replace error:", e.message);
            }
        },
        toggleEditChat() {
            this.updateChatFormIsVisible = !this.updateChatFormIsVisible;
        },
    },
    template: `
<li>
    <span class="timestamp">
        {{ new Date(chat.ts).toLocaleString(undefined, {dateStyle: 'short', timeStyle: 'short'}) }}
        <span class="chat-user-id">{{ chatUserId }}:</span>
    </span>
    <span class="msg">
        <template v-if="updateChatFormIsVisible">
            <input type="text" v-model="chat.msg" />
            <button class="button-small" type="submit" @click="updateChat()">Update</button>
            <button class="button-small" type="submit" @click="replaceChat()">Replace</button>
        </template>
        <template v-else>
            {{ chat.msg }}
        </template>
    </span>
    <span class="chat-buttons">
        <button class="button-small" @click="toggleEditChat()">Edit</button>
        <button class="button-small" @click="deleteChat()">Delete</button>
    </span>
</li>
    `,
});

Vue.component("chat-room", {
    props: ["userId", "roomId", "user"],
    data() {
        return {
            chats: [],
            message: "",
            saveButtonText: "Save users",
            initialSaveButtonText: "Save users",
            initialPermission: {
                userId: "",
                insert: false,
                read: false,
                update: false,
                delete: false,
            },
            permissions: [],
            hasAccess: true,
            roomUnsubscribe: null,
            myUserId: "",
        };
    },
    created() {
        this.saveButtonText = this.initialSaveButtonText;

        const me = rid.userInfo();
        this.myUserId = me.id;

        console.log("this.myUserId", this.myUserId);

        this.addUser();
        this.fetchPermissions();
        this.subscribe();
        this.fetchChats();
    },
    async beforeDestroy() {
        console.log("unsubscribe");
        this.roomUnsubscribe();
    },
    computed: {
        roomTableName: function () {
            return `${ROOM_TABLE_NAMESPACE}_${this.roomId}`;
        },
        roomTable: async function () {
            return await rid.table(this.roomTableName, { userId: this.userId });
        },
        guestTable: async function () {
            return await rid.table(GUEST_ROOMS_TABLE_NAME);
        },
        isOwner: function () {
            return this.user.id === this.$route.params.userId;
        },
    },
    methods: {
        async deleteRoom() {
            const tableName = `${ROOM_TABLE_NAMESPACE}_${this.roomId}`;

            const response = await rid.tablesDrop(tableName);

            console.log("drop table response", response);

            router.push({ name: "home" });
        },
        async manageGuestRooms() {
            const row = { roomId: this.roomId, userId: this.userId };

            try {
                const guestTable = await this.guestTable;
                const readResponse = await guestTable.read();

                const guestRooms = readResponse.data;
                let guestRoomExists = guestRooms.some((g) => g.roomId === this.roomId && g.userId === this.userId);

                if (!guestRoomExists) {
                    await guestTable.insert(row);
                }
            } catch (e) {
                console.error("manageGuestRooms guestTable.read error, so try to create+insert:", e.message);
                // Table probably doesn't exist, create and insert
                // Use tableInsert instead of table.insert because assuming table doesn't yet exist.
                await rid.tableInsert(GUEST_ROOMS_TABLE_NAME, row);
            }
        },
        async fetchChats() {
            try {
                const roomTable = await this.roomTable;
                const response = await roomTable.read();

                console.log("response", response);

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
                const listener = (changes) => {
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
                };

                const roomTable = await this.roomTable;

                this.roomUnsubscribe = await roomTable.subscribe(
                    {
                        userId: this.$route.params.userId,
                    },
                    listener,
                );
            } catch (e) {
                console.error("roomTable.subscribe", e.message);
            }
        },
        async fetchPermissions() {
            if (!this.isOwner) {
                console.log("is not owner, do not get permissions");
                return;
            }

            try {
                const response = await rid.permissionsGet({ tableName: this.roomTableName });

                /**
                 * @type {FormPermission[]}
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

                        if (permission.type === "read") {
                            formPermission.read = true;
                            formPermission.readId = permission.id;
                        }
                        if (permission.type === "insert") {
                            formPermission.insert = true;
                            formPermission.insertId = permission.id;
                        }
                        if (permission.type === "update") {
                            formPermission.update = true;
                            formPermission.updateId = permission.id;
                        }
                        if (permission.type === "delete") {
                            formPermission.delete = true;
                            formPermission.deleteId = permission.id;
                        }

                        formPermissions.push(formPermission);
                    } else {
                        const index = formPermissions.findIndex((p) => p.userId === permission.userId);
                        formPermissions[index][permission.type] = true;
                        formPermissions[index][`${permission.type}Id`] = permission.id;
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
                userId: this.user.id,
                username: this.user.name,
                roomId: this.roomId,
            };

            try {
                const roomTable = await this.roomTable;
                const response = await roomTable.insert(message, { userId: this.userId });
                console.log("sendMessage roomTable.Insert response", response);
                this.message = "";
            } catch (e) {
                console.error("sendMessage roomTable.Insert error:", e.message);
            }
        },
        async setPermissions() {
            /**
             * Do not include empty permissions
             * @type {FormPermission[]}
             */
            const permissions = this.permissions.filter((permission) => permission.userId !== "");

            /**
             * @type {PayloadPermission[]}
             */
            const payload = [];
            const permissionTypes = ["read", "insert", "update", "delete"];

            for (const permission of permissions) {
                for (const type of permissionTypes) {
                    if (permission[type]) {
                        payload.push({
                            id: permission[`${type}Id`],
                            tableName: this.roomTableName,
                            userId: permission.userId,
                            type: type,
                        });
                    } else if (permission[`${type}Id`]) {
                        // a type that exists in the DB, because it has an ID, but is now false and needs to be deleted
                        try {
                            const response = await rid.permissionsDelete({ permissionId: permission[`${type}Id`] });
                            console.log("permissionsDelete response.message", response.message);
                        } catch (e) {
                            console.error("permissionsDelete error", e.message);
                        }
                    }
                }
            }

            try {
                this.saveButtonText = "Saving...";
                await rid.permissionsSet(payload);
                this.fetchPermissions();
                this.saveButtonText = "Saved!";
                setTimeout(() => {
                    this.saveButtonText = this.initialSaveButtonText;
                }, 1000);
            } catch (e) {
                console.error("permissionsSet error", e.message);
            }
        },
        addUser() {
            this.permissions.unshift(Object.assign({}, this.initialPermission));
        },
    },
    template: `
<div class="chat-room">
<div class="chat-ui">
        <ul id="chat-log">
            <chat-item v-for="chat in chats" :key="chat.id" :chat="chat" :myUserId="myUserId" :roomTableName="roomTableName"></chat-item>
        </ul>
        <form class="message-form" v-on:submit.prevent="sendMessage">
            <input type="text" v-model="message" autocomplete="off" />
            <button>Send</button>
        </form>
    </div>
    <div class="chat-room-info">
    <div class="space-between">
        <h3>{{ this.roomId }}</h3>
        <button v-if="isOwner" class="button-small" type="button" @click="deleteRoom()">Delete room</button>
    </div>
    <template v-if="isOwner">
            <p>To invite someone, share the URL in your address bar, and add them as a user below.</p>
            <h4>Users</h4>
            <p>To remove a user, save without permissions.</p>
            <form v-on:submit.prevent="setPermissions">
                <div class="space-between">
                    <button class="button-small" type="button" @click="addUser">Add user</button>
                    <button v-if="permissions.length > 0" class="button-primary button-small" type="submit">{{ saveButtonText }}</button>
                </div>
                <div class="card" v-for="(p, index) of permissions" :key="index">
                    <label :for="'user-id-' + index">User ID</label>
                    <input :id="'user-id-' + index" class="u-full-width" type="text" v-model="permissions[index].userId" placeholder="e.g. 983c783f-6f9e-4367-83d2-0cdb644a1f1e" />

                    <label>
                        <input type="checkbox" value="true" v-model="permissions[index].read">
                        <span class="label-body">Read</span>
                    </label>
                    <label>
                        <input type="checkbox" value="true" v-model="permissions[index].insert">
                        <span class="label-body">Insert</span>
                    </label>
                    <label>
                        <input type="checkbox" value="true" v-model="permissions[index].update">
                        <span class="label-body">Update</span>
                    </label>
                    <label>
                        <input type="checkbox" value="true" v-model="permissions[index].delete">
                        <span class="label-body">Delete</span>
                    </label>

                    <input type="hidden" v-model="permissions[index].readId" />
                    <input type="hidden" v-model="permissions[index].updateId" />
                    <input type="hidden" v-model="permissions[index].insertId" />
                    <input type="hidden" v-model="permissions[index].deleteId" />
                </div>
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

new Vue({
    router,
    render: (h) => h(App),
}).$mount("#app");
