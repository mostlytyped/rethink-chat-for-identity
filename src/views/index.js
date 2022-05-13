import { rid, logIn } from "../rethinkid";

import { ROOM_TABLE_NAMESPACE, GUEST_ROOMS_TABLE_NAME } from "../constants";

export const RoomView = Vue.component("room-view", {
    props: ["user"],
    template: `<chat-room :userId="$route.params.userId" :roomId="$route.params.roomId" :user="user" />`,
});

export const MainView = Vue.component("main-view", {
    props: ["user"],
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
            const response = await rid.tableRead(GUEST_ROOMS_TABLE_NAME);
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
            // Replace space with dash
            const roomName = this.room.toLowerCase().replace(/ /g, "-");
            const tableName = `${ROOM_TABLE_NAMESPACE}_${roomName}`;

            try {
                await rid.tablesCreate(tableName);
                this.$router.push({ name: "room", params: { userId: this.user.id, roomId: roomName } });
            } catch (e) {
                console.error("tablesCreate error:", e.message);
            }
        },
    },
    template: `
<div class="main">
    <h1>Dashboard</h1>
    <div class="dashboard-grid">
        <div class="card">
            <form v-on:submit.prevent="createAndGoToRoom">
                <h2>Create Room</h2>
                <div>
                    <label for="room-name">Room name</label>
                    <input id="room-name" class="u-full-width" v-model="room" type="text" />
                </div>
                <button type="submit" class="button button-primary">Create and Join Room</button>
            </form>
        </div>
        <div v-if="roomIds.length > 0" class="card">
            <h2>My Rooms</h2>
            <ul class="rooms-list">
                <li v-for="(roomId, index) of roomIds" :key="index">
                    <router-link :to="{ name: 'room', params: { userId: user.id, roomId: roomId }}">{{ roomId }}</router-link>
                </li>
            </ul>
        </div>
        <div v-if="guestRooms.length > 0" class="card">
            <h2>My Guest Rooms</h2>
            <ul class="rooms-list">
                <li v-for="(room, index) of guestRooms" :key="index">
                    <router-link :to="{ name: 'room', params: { userId: room.userId, roomId: room.roomId }}">{{ room.roomId }}</router-link>
                </li>
            </ul>
        </div>
    </div>
</div>
  `,
});

export const LoggedOutView = Vue.component("logged-out-view", {
    data() {
        return {
            logInUri: "",
        };
    },
    async created() {
        this.logInUri = await rid.logInUri();
    },
    template: `
<div class="main">
    <div class="container-small">
        <div class="card">
            <h1>You are logged out</h1>
            <div v-if="logInUri" class="row">
                <div class="six columns">
                    <a class="button button-primary u-full-width" :href="logInUri">Log in</a>
                </div>
                <div class="six columns">
                    <a class="button u-full-width" :href="logInUri">Sign up</a>
                </div>
            </div>
        </div>
    </div>
</div>`,
});
