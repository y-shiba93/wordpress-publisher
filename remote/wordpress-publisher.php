<?php
// Runs through `wp eval-file` from a private, short-lived release directory.
if (!defined('WP_CLI') || !WP_CLI) { exit(1); }

function publisher_result($value) {
    WP_CLI::log('WP_PUBLISHER_JSON='.wp_json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

function publisher_payload($base) {
    $real = realpath($base);
    if (!$real || !is_dir($real) || is_link($real)) { throw new RuntimeException('Invalid release directory'); }
    $raw = file_get_contents($real.'/payload.json');
    if ($raw === false) { throw new RuntimeException('Payload not found'); }
    return [$real, json_decode($raw, true, 512, JSON_THROW_ON_ERROR)];
}

function publisher_upload($base, $item) {
    require_once ABSPATH.'wp-admin/includes/file.php';
    require_once ABSPATH.'wp-admin/includes/media.php';
    require_once ABSPATH.'wp-admin/includes/image.php';
    $name = basename((string)$item['filePath']);
    $source = $base.'/'.$name;
    if (!is_file($source) || is_link($source)) { throw new RuntimeException('Invalid media file: '.$name); }
    $tmp = wp_tempnam($name);
    if (!$tmp || !copy($source, $tmp)) { throw new RuntimeException('Media staging failed: '.$name); }
    $file = ['name'=>(string)$item['filename'], 'tmp_name'=>$tmp];
    $id = media_handle_sideload($file, 0, (string)($item['alt'] ?? ''));
    if (is_wp_error($id)) { @unlink($tmp); throw new RuntimeException($id->get_error_message()); }
    update_post_meta($id, '_wp_attachment_image_alt', sanitize_text_field((string)($item['alt'] ?? '')));
    return ['id'=>(int)$id, 'url'=>wp_get_attachment_url($id)];
}

$operation = $args[0] ?? '';
$base = $args[1] ?? '';
try {
    [$base, $payload] = publisher_payload($base);
    if (is_multisite()) { throw new RuntimeException('Multisite is not supported'); }
    if ($operation === 'taxonomy') {
        $taxonomy = $payload['taxonomy'] ?? '';
        if (!in_array($taxonomy, ['categories','tags'], true)) { throw new RuntimeException('Invalid taxonomy'); }
        $wp_taxonomy = $taxonomy === 'categories' ? 'category' : 'post_tag';
        $terms = get_terms(['taxonomy'=>$wp_taxonomy, 'hide_empty'=>false, 'orderby'=>'name', 'order'=>'ASC']);
        if (is_wp_error($terms)) { throw new RuntimeException($terms->get_error_message()); }
        publisher_result(['terms'=>array_map(fn($term)=>['id'=>(int)$term->term_id,'name'=>$term->name,'slug'=>$term->slug], $terms)]);
        return;
    }
    if ($operation === 'get-post') {
        $post = get_post((int)($payload['postId'] ?? 0));
        if (!$post) { throw new RuntimeException('Post not found'); }
        publisher_result([
            'id'=>(int)$post->ID,'slug'=>$post->post_name,'status'=>$post->post_status,'link'=>get_permalink($post),
            'content'=>['raw'=>$post->post_content],'title'=>['raw'=>$post->post_title],'excerpt'=>['raw'=>$post->post_excerpt],
            'featured_media'=>(int)get_post_thumbnail_id($post->ID),
            'categories'=>wp_get_post_terms($post->ID,'category',['fields'=>'ids']),
            'tags'=>wp_get_post_terms($post->ID,'post_tag',['fields'=>'ids']),
        ]);
        return;
    }
    if ($operation !== 'upsert') { throw new RuntimeException('Invalid operation'); }
    $endpoint = $payload['endpoint'] ?? 'posts';
    $post_type = $endpoint === 'pages' ? 'page' : 'post';
    $post_id = (int)($payload['postId'] ?? 0);
    if ($post_id) {
        $existing = get_post($post_id);
        if (!$existing || $existing->post_type !== $post_type) { throw new RuntimeException('Post target mismatch'); }
    }
    $content = (string)($payload['content'] ?? '');
    $uploaded = [];
    foreach (($payload['media'] ?? []) as $item) {
        $result = publisher_upload($base, $item);
        $uploaded[(string)$item['key']] = $result;
        $content = str_replace((string)$item['placeholder'], $result['url'], $content);
    }
    $post = [
        'post_type'=>$post_type,
        'post_title'=>(string)$payload['title'],
        'post_name'=>(string)$payload['slug'],
        'post_content'=>$content,
        'post_excerpt'=>(string)($payload['excerpt'] ?? ''),
        'post_status'=>(string)($payload['status'] ?? 'draft'),
    ];
    if ($post_id) $post['ID'] = $post_id;
    if (!empty($payload['author'])) $post['post_author'] = (int)$payload['author'];
    if (isset($payload['parent'])) $post['post_parent'] = (int)$payload['parent'];
    $result_id = $post_id ? wp_update_post(wp_slash($post), true) : wp_insert_post(wp_slash($post), true);
    if (is_wp_error($result_id)) { throw new RuntimeException($result_id->get_error_message()); }
    if ($post_type === 'post') {
        if (isset($payload['categories'])) wp_set_post_terms($result_id, array_map('intval',$payload['categories']), 'category', false);
        if (isset($payload['tags'])) wp_set_post_terms($result_id, array_map('intval',$payload['tags']), 'post_tag', false);
    }
    $featured = (int)($payload['featured_media'] ?? 0);
    if (!empty($payload['featuredPlaceholder'])) {
        foreach (($payload['media'] ?? []) as $item) {
            if ($item['placeholder'] === $payload['featuredPlaceholder']) $featured = (int)$uploaded[(string)$item['key']]['id'];
        }
    }
    if ($featured) set_post_thumbnail($result_id, $featured);
    clean_post_cache($result_id);
    publisher_result(['id'=>(int)$result_id,'link'=>get_permalink($result_id),'status'=>get_post_status($result_id),'featured_media'=>$featured,'uploaded'=>$uploaded]);
} catch (Throwable $error) {
    WP_CLI::error($error->getMessage());
}
