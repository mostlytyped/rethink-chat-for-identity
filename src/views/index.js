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
            const tableName = `${ROOM_TABLE_NAMESPACE}_${this.room}`;

            try {
                await rid.tablesCreate(tableName);
                this.$router.push({ name: "room", params: { userId: this.user.id, roomId: this.room } });
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
              <router-link :to="{ name: 'room', params: { userId: user.id, roomId: roomId }}">{{ roomId }}</router-link>
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

export const LoggedOutView = Vue.component("logged-out-view", {
    data() {
        return {
            logInUri: "",
        };
    },
    async created() {
        this.logInUri = await rid.logInUri();
    },
    computed: {
        signUpUrl: function () {
            return rid.signUpUri();
        },
    },
    template: `
<div>
    <h1>You are logged out</h1>
    <template v-if="logInUri">
        <div>
            <a :href="logInUri">Log in</a>
        </div>
        <div>
            <a :href="signUpUrl">Sign up</a>
        </div>
    </template>
</div>`,
});
