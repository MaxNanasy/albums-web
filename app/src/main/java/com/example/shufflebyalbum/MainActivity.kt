package com.example.shufflebyalbum

import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.ListView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray
import org.json.JSONObject
import kotlin.random.Random

data class ShuffleItem(
    val type: String,
    val uri: String,
)

class MainActivity : AppCompatActivity() {
    private lateinit var itemUriInput: EditText
    private lateinit var itemListView: ListView
    private lateinit var queueListView: ListView
    private lateinit var statusText: TextView
    private lateinit var storageJsonInput: EditText

    private val items = mutableListOf<ShuffleItem>()
    private val queue = mutableListOf<ShuffleItem>()
    private var currentIndex = 0

    private lateinit var itemAdapter: ArrayAdapter<String>
    private lateinit var queueAdapter: ArrayAdapter<String>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        bindViews()
        setupListAdapters()
        loadItems()
        renderItems()
        renderQueue()
        setupActions()
    }

    private fun bindViews() {
        itemUriInput = findViewById(R.id.itemUriInput)
        itemListView = findViewById(R.id.itemList)
        queueListView = findViewById(R.id.queueList)
        statusText = findViewById(R.id.statusText)
        storageJsonInput = findViewById(R.id.storageJsonInput)
    }

    private fun setupListAdapters() {
        itemAdapter = ArrayAdapter(this, android.R.layout.simple_list_item_single_choice, mutableListOf())
        itemListView.adapter = itemAdapter

        queueAdapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, mutableListOf())
        queueListView.adapter = queueAdapter
    }

    private fun setupActions() {
        findViewById<Button>(R.id.addButton).setOnClickListener {
            addItemFromInput()
        }

        findViewById<Button>(R.id.removeButton).setOnClickListener {
            removeSelectedItem()
        }

        findViewById<Button>(R.id.startButton).setOnClickListener {
            startShuffleSession()
        }

        findViewById<Button>(R.id.skipButton).setOnClickListener {
            skipToNext()
        }

        findViewById<Button>(R.id.stopButton).setOnClickListener {
            stopSession()
        }

        findViewById<Button>(R.id/exportButton).setOnClickListener {
            exportStorage()
        }

        findViewById<Button>(R.id/importButton).setOnClickListener {
            importStorage()
        }
    }

    private fun addItemFromInput() {
        val raw = itemUriInput.text.toString().trim()
        val parsed = parseSpotifyRef(raw)
        if (parsed == null) {
            toast(getString(R.string.invalid_spotify_ref))
            return
        }

        if (items.any { it.uri == parsed.uri }) {
            toast(getString(R.string.item_already_exists))
            return
        }

        items.add(parsed)
        itemUriInput.text.clear()
        persistItems()
        renderItems()
    }

    private fun removeSelectedItem() {
        val selected = itemListView.checkedItemPosition
        if (selected < 0 || selected >= items.size) {
            toast(getString(R.string.select_item_to_remove))
            return
        }

        items.removeAt(selected)
        itemListView.clearChoices()
        persistItems()
        renderItems()
    }

    private fun startShuffleSession() {
        if (items.isEmpty()) {
            statusText.text = getString(R.string.status_no_items)
            toast(getString(R.string.add_items_first))
            return
        }

        queue.clear()
        queue.addAll(items.shuffled(Random(System.currentTimeMillis())))
        currentIndex = 0
        renderQueue()
        updateNowPlayingStatus()
    }

    private fun skipToNext() {
        if (queue.isEmpty()) {
            statusText.text = getString(R.string.status_idle)
            toast(getString(R.string.no_active_session))
            return
        }

        currentIndex += 1
        if (currentIndex >= queue.size) {
            statusText.text = getString(R.string.status_session_finished)
            queue.clear()
            renderQueue()
            return
        }

        renderQueue()
        updateNowPlayingStatus()
    }

    private fun stopSession() {
        queue.clear()
        currentIndex = 0
        renderQueue()
        statusText.text = getString(R.string.status_idle)
    }

    private fun updateNowPlayingStatus() {
        if (queue.isEmpty() || currentIndex !in queue.indices) {
            statusText.text = getString(R.string.status_idle)
            return
        }

        val current = queue[currentIndex]
        val message = getString(
            R.string.status_now_playing,
            current.type,
            currentIndex + 1,
            queue.size,
            current.uri,
        )
        statusText.text = message
    }

    private fun renderItems() {
        val display = items.map { "${it.type}: ${it.uri}" }
        itemAdapter.clear()
        itemAdapter.addAll(display)
        itemAdapter.notifyDataSetChanged()
    }

    private fun renderQueue() {
        val display = queue.mapIndexed { index, item ->
            val marker = if (index == currentIndex) "▶" else "•"
            "$marker ${index + 1}. ${item.type}: ${item.uri}"
        }

        queueAdapter.clear()
        queueAdapter.addAll(display)
        queueAdapter.notifyDataSetChanged()
    }

    private fun persistItems() {
        val array = JSONArray()
        for (item in items) {
            array.put(
                JSONObject()
                    .put("type", item.type)
                    .put("uri", item.uri),
            )
        }

        prefs().edit()
            .putString(KEY_ITEMS, array.toString())
            .apply()
    }

    private fun loadItems() {
        val raw = prefs().getString(KEY_ITEMS, null) ?: return
        val parsed = runCatching { JSONArray(raw) }.getOrNull() ?: return

        items.clear()
        for (index in 0 until parsed.length()) {
            val obj = parsed.optJSONObject(index) ?: continue
            val type = obj.optString("type")
            val uri = obj.optString("uri")
            if ((type == TYPE_ALBUM || type == TYPE_PLAYLIST) && uri.isNotBlank()) {
                items.add(ShuffleItem(type, uri))
            }
        }
    }

    private fun exportStorage() {
        val snapshot = JSONObject()
            .put(KEY_ITEMS, prefs().getString(KEY_ITEMS, "[]"))
        storageJsonInput.setText(snapshot.toString(2))
        toast(getString(R.string.storage_exported))
    }

    private fun importStorage() {
        val raw = storageJsonInput.text.toString().trim()
        if (raw.isEmpty()) {
            toast(getString(R.string.storage_import_empty))
            return
        }

        val parsed = runCatching { JSONObject(raw) }.getOrNull()
        if (parsed == null) {
            toast(getString(R.string.storage_import_invalid))
            return
        }

        val newItems = parsed.optString(KEY_ITEMS, "[]")
        prefs().edit().putString(KEY_ITEMS, newItems).apply()
        stopSession()
        loadItems()
        renderItems()
        toast(getString(R.string.storage_imported))
    }

    private fun parseSpotifyRef(raw: String): ShuffleItem? {
        if (raw.isBlank()) return null

        val uriRegex = Regex("^spotify:(album|playlist):([a-zA-Z0-9]+)$")
        val uriMatch = uriRegex.find(raw)
        if (uriMatch != null) {
            return ShuffleItem(type = uriMatch.groupValues[1], uri = raw)
        }

        val webRegex = Regex("^https://open\\.spotify\\.com/(album|playlist)/([a-zA-Z0-9]+).*$")
        val webMatch = webRegex.find(raw)
        if (webMatch != null) {
            val type = webMatch.groupValues[1]
            val id = webMatch.groupValues[2]
            return ShuffleItem(type = type, uri = "spotify:$type:$id")
        }

        return null
    }

    private fun prefs() = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }

    companion object {
        private const val PREFS_NAME = "spotify_shuffler"
        private const val KEY_ITEMS = "spotifyShuffler.items"
        private const val TYPE_ALBUM = "album"
        private const val TYPE_PLAYLIST = "playlist"
    }
}
